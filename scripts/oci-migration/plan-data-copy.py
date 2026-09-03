#!/usr/bin/env python3
"""
Build a dependency-safe Teswa public-table data copy plan from a manifest.

The planner is read-only and operates on the JSON produced by
capture-postgres-manifest.py. It does not connect to either database.

Important:
- Public -> public foreign keys define load dependencies.
- Public -> auth/storage/other schemas are external anchors and are surfaced
  explicitly rather than silently ignored.
- Cycles/self-references are grouped and require a deliberate isolated-target
  strategy (for example: add FKs after load, or use deferrable constraints when
  the actual baseline allows it). The script never disables constraints itself.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", help="Source manifest JSON.")
    parser.add_argument("--output", required=True, help="Output JSON plan.")
    return parser.parse_args()


def tarjan_scc(nodes: list[str], adjacency: dict[str, set[str]]) -> list[list[str]]:
    index = 0
    stack: list[str] = []
    on_stack: set[str] = set()
    indices: dict[str, int] = {}
    lowlink: dict[str, int] = {}
    components: list[list[str]] = []

    def strongconnect(node: str) -> None:
        nonlocal index
        indices[node] = index
        lowlink[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)

        for nxt in sorted(adjacency.get(node, set())):
            if nxt not in indices:
                strongconnect(nxt)
                lowlink[node] = min(lowlink[node], lowlink[nxt])
            elif nxt in on_stack:
                lowlink[node] = min(lowlink[node], indices[nxt])

        if lowlink[node] == indices[node]:
            component: list[str] = []
            while True:
                item = stack.pop()
                on_stack.remove(item)
                component.append(item)
                if item == node:
                    break
            components.append(sorted(component))

    for node in sorted(nodes):
        if node not in indices:
            strongconnect(node)

    return components


def main() -> int:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))

    catalog = manifest.get("catalog", {})
    tables = sorted(
        row["table_name"]
        for row in catalog.get("tables", [])
        if row.get("schema_name") == "public"
    )
    table_set = set(tables)
    foreign_keys = catalog.get("foreign_keys")

    if foreign_keys is None:
        raise SystemExit(
            "Manifest has no catalog.foreign_keys. Re-capture it with "
            "capture-postgres-manifest.py format_version >= 2."
        )

    # parent -> children so topological order naturally emits referenced rows first.
    adjacency: dict[str, set[str]] = {table: set() for table in tables}
    public_dependencies: list[dict[str, Any]] = []
    external_dependencies: list[dict[str, Any]] = []
    self_edges: set[str] = set()

    for fk in foreign_keys:
        child = fk.get("source_table")
        parent_schema = fk.get("target_schema")
        parent = fk.get("target_table")

        if child not in table_set:
            continue

        edge = {
            "constraint_name": fk.get("constraint_name"),
            "child_table": child,
            "child_columns": fk.get("source_columns") or [],
            "parent_schema": parent_schema,
            "parent_table": parent,
            "parent_columns": fk.get("target_columns") or [],
            "is_deferrable": bool(fk.get("is_deferrable")),
            "initially_deferred": bool(fk.get("initially_deferred")),
        }

        if parent_schema == "public" and parent in table_set:
            adjacency[parent].add(child)
            public_dependencies.append(edge)
            if parent == child:
                self_edges.add(child)
        else:
            external_dependencies.append(edge)

    components = tarjan_scc(tables, adjacency)
    component_of: dict[str, int] = {}
    for cid, component in enumerate(components):
        for table in component:
            component_of[table] = cid

    cyclic_components: set[int] = set()
    for cid, component in enumerate(components):
        if len(component) > 1:
            cyclic_components.add(cid)
        elif component and component[0] in self_edges:
            cyclic_components.add(cid)

    condensed: dict[int, set[int]] = {cid: set() for cid in range(len(components))}
    indegree: dict[int, int] = {cid: 0 for cid in range(len(components))}

    for parent, children in adjacency.items():
        src = component_of[parent]
        for child in children:
            dst = component_of[child]
            if src == dst or dst in condensed[src]:
                continue
            condensed[src].add(dst)
            indegree[dst] += 1

    ready = deque(sorted(cid for cid, degree in indegree.items() if degree == 0))
    stages: list[list[int]] = []
    visited = 0

    while ready:
        current = list(ready)
        ready.clear()
        stages.append(current)
        next_ready: list[int] = []

        for cid in current:
            visited += 1
            for nxt in sorted(condensed[cid]):
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    next_ready.append(nxt)

        for cid in sorted(next_ready):
            ready.append(cid)

    if visited != len(components):
        raise SystemExit("Internal planner error: condensation graph was not acyclic.")

    pk_map = {
        row.get("table_name"): row.get("columns") or []
        for row in catalog.get("primary_keys", [])
        if row.get("schema_name") == "public"
    }
    tables_without_pk = sorted(table for table in tables if not pk_map.get(table))

    rendered_stages: list[dict[str, Any]] = []
    for stage_number, component_ids in enumerate(stages, start=1):
        groups = []
        for cid in component_ids:
            component_tables = components[cid]
            groups.append(
                {
                    "tables": component_tables,
                    "cyclic": cid in cyclic_components,
                    "strategy": (
                        "load as a cycle-aware group; add/validate relevant FKs after data "
                        "or use verified deferrable semantics"
                        if cid in cyclic_components
                        else "normal dependency-ordered load"
                    ),
                }
            )
        rendered_stages.append({"stage": stage_number, "groups": groups})

    plan = {
        "format_version": 1,
        "source_label": manifest.get("label"),
        "source_manifest_sha256": manifest.get("manifest_sha256"),
        "public_table_count": len(tables),
        "public_fk_count": len(public_dependencies),
        "external_fk_count": len(external_dependencies),
        "load_stages": rendered_stages,
        "cyclic_groups": [
            {
                "tables": components[cid],
                "all_internal_fks_deferrable": all(
                    dep["is_deferrable"]
                    for dep in public_dependencies
                    if dep["child_table"] in components[cid]
                    and dep["parent_table"] in components[cid]
                ),
            }
            for cid in sorted(cyclic_components)
        ],
        "external_dependencies": sorted(
            external_dependencies,
            key=lambda row: (
                str(row["parent_schema"]),
                str(row["parent_table"]),
                str(row["child_table"]),
                str(row["constraint_name"]),
            ),
        ),
        "tables_without_primary_key": tables_without_pk,
        "safety": {
            "connects_to_database": False,
            "performs_writes": False,
            "automatic_constraint_disable": False,
        },
        "execution_rules": [
            "Do not load production OCI until the target is isolated and Lane 3 hands it off.",
            "Preserve UUIDs and timestamps exactly.",
            "Resolve external auth/storage anchors before enforcing cross-schema FKs.",
            "For cyclic groups, never guess: use a reviewed post-data FK validation or verified deferrable strategy.",
            "After each watermark load, recapture both manifests and run deep checksum comparison.",
        ],
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "output": str(output),
                "public_tables": len(tables),
                "public_fks": len(public_dependencies),
                "external_fks": len(external_dependencies),
                "stages": len(rendered_stages),
                "cyclic_groups": len(cyclic_components),
                "tables_without_primary_key": len(tables_without_pk),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
