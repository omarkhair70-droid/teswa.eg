#!/usr/bin/env python3
"""
Compare normalized Lane-2 contract shadow result snapshots.

Input JSON format:
{
  "results": {
    "marketplace.list": <JSON value>,
    "profile.mine": <JSON value>
  }
}

Optional rules JSON:
{
  "marketplace.list": {
    "ignore_paths": ["/items/0/signedUrl"],
    "sort_arrays_at": {"/items": "id"}
  }
}

JSON pointer support is deliberately simple and fail-closed. Use only for
known provider-volatile fields such as generated signed URLs or timestamps that
are explicitly outside a scenario's semantic contract.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("source")
    p.add_argument("target")
    p.add_argument("--rules")
    p.add_argument("--report", required=True)
    return p.parse_args()


def decode_pointer(path: str) -> list[str]:
    if path == "":
        return []
    if not path.startswith("/"):
        raise ValueError(f"Invalid JSON pointer: {path}")
    return [part.replace("~1", "/").replace("~0", "~") for part in path[1:].split("/")]


def resolve_parent(value: Any, path: str) -> tuple[Any, str] | None:
    parts = decode_pointer(path)
    if not parts:
        return None
    current = value
    for part in parts[:-1]:
        if isinstance(current, dict):
            if part not in current:
                return None
            current = current[part]
        elif isinstance(current, list):
            try:
                index = int(part)
            except ValueError:
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
        else:
            return None
    return current, parts[-1]


def remove_path(value: Any, path: str) -> None:
    resolved = resolve_parent(value, path)
    if resolved is None:
        return
    parent, key = resolved
    if isinstance(parent, dict):
        parent.pop(key, None)
    elif isinstance(parent, list):
        try:
            index = int(key)
        except ValueError:
            return
        if 0 <= index < len(parent):
            parent[index] = None


def get_path(value: Any, path: str) -> Any:
    current = value
    for part in decode_pointer(path):
        if isinstance(current, dict):
            current = current[part]
        elif isinstance(current, list):
            current = current[int(part)]
        else:
            raise KeyError(path)
    return current


def set_path(value: Any, path: str, replacement: Any) -> None:
    resolved = resolve_parent(value, path)
    if resolved is None:
        if path == "":
            raise ValueError("Root replacement is not supported for sort_arrays_at")
        return
    parent, key = resolved
    if isinstance(parent, dict):
        parent[key] = replacement
    elif isinstance(parent, list):
        parent[int(key)] = replacement


def normalize(value: Any, rule: dict[str, Any]) -> Any:
    result = copy.deepcopy(value)

    for path in rule.get("ignore_paths", []):
        remove_path(result, str(path))

    for path, key in (rule.get("sort_arrays_at") or {}).items():
        try:
            arr = get_path(result, str(path))
        except (KeyError, IndexError, ValueError, TypeError):
            continue
        if not isinstance(arr, list):
            raise ValueError(f"sort_arrays_at path is not an array: {path}")
        if key is None:
            sorted_arr = sorted(arr, key=lambda item: json.dumps(item, sort_keys=True))
        else:
            sorted_arr = sorted(
                arr,
                key=lambda item: (
                    "" if not isinstance(item, dict) or item.get(str(key)) is None
                    else str(item.get(str(key)))
                ),
            )
        set_path(result, str(path), sorted_arr)

    return result


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def main() -> int:
    args = parse_args()
    source = json.loads(Path(args.source).read_text(encoding="utf-8")).get("results", {})
    target = json.loads(Path(args.target).read_text(encoding="utf-8")).get("results", {})
    rules = json.loads(Path(args.rules).read_text(encoding="utf-8")) if args.rules else {}

    scenario_ids = sorted(set(source) | set(target))
    rows = []
    failures = 0

    for scenario_id in scenario_ids:
        if scenario_id not in source:
            rows.append({"id": scenario_id, "status": "missing_source"})
            failures += 1
            continue
        if scenario_id not in target:
            rows.append({"id": scenario_id, "status": "missing_target"})
            failures += 1
            continue

        rule = rules.get(scenario_id, {})
        src = normalize(source[scenario_id], rule)
        dst = normalize(target[scenario_id], rule)
        matched = canonical(src) == canonical(dst)
        if not matched:
            failures += 1

        rows.append(
            {
                "id": scenario_id,
                "status": "pass" if matched else "mismatch",
                "rule": rule,
                "source_normalized": src if not matched else None,
                "target_normalized": dst if not matched else None,
            }
        )

    report = {
        "format_version": 1,
        "hard_gate_pass": failures == 0,
        "scenario_count": len(scenario_ids),
        "failures": failures,
        "results": rows,
        "rule": (
            "Only explicitly configured provider-volatile fields may be ignored. "
            "Do not normalize away authorization, IDs, state transitions, ordering, or error semantics."
        ),
    }

    out = Path(args.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "hard_gate_pass": report["hard_gate_pass"],
        "scenario_count": len(scenario_ids),
        "failures": failures,
        "report": str(out),
    }, indent=2))
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
