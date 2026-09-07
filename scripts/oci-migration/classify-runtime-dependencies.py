#!/usr/bin/env python3
"""
Classify provider/runtime dependencies captured in a Teswa PostgreSQL manifest.

No database access. This creates a review queue; it never rewrites SQL.

Primary classifications:
- KEEP_CANDIDATE: no known Supabase/runtime dependency detected
- REBUILD_AUTHORIZATION: auth.uid/auth.users/request JWT context
- REBUILD_STORAGE: storage schema/provider semantics
- REBUILD_HTTP_WORKER: pg_net/net.http/http_request transport
- REBUILD_SECRETS: Supabase Vault references
- REBUILD_SCHEDULER: pg_cron/cron references
- REVIEW_SECURITY_DEFINER: SECURITY DEFINER without another known provider marker
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


PATTERNS = [
    ("REBUILD_AUTHORIZATION", re.compile(r"(?i)\bauth\.uid\s*\(|\bauth\.users\b|request\.jwt|request\.headers|request\.cookies")),
    ("REBUILD_STORAGE", re.compile(r"(?i)\bstorage\.")),
    ("REBUILD_HTTP_WORKER", re.compile(r"(?i)\bpg_net\b|\bnet\.http|\bhttp_request\s*\(")),
    ("REBUILD_SECRETS", re.compile(r"(?i)\bsupabase_vault\b|(?<![a-z0-9_])vault\.")),
    ("REBUILD_SCHEDULER", re.compile(r"(?i)\bpg_cron\b|(?<![a-z0-9_])cron\.")),
]


def classify_text(text: str, security_definer: bool = False) -> list[str]:
    hits = [name for name, pattern in PATTERNS if pattern.search(text)]
    if not hits:
        return ["REVIEW_SECURITY_DEFINER"] if security_definer else ["KEEP_CANDIDATE"]
    return hits


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("manifest")
    p.add_argument("--output", required=True)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    catalog = manifest.get("catalog", {})

    functions = []
    function_class_by_name: dict[str, set[str]] = {}
    for row in catalog.get("functions", []):
        definition = str(row.get("definition") or "")
        classes = classify_text(definition, bool(row.get("security_definer")))
        key = f"{row.get('function_name')}({row.get('identity_arguments') or ''})"
        functions.append({
            "function": key,
            "security_definer": bool(row.get("security_definer")),
            "classifications": classes,
        })
        function_class_by_name.setdefault(str(row.get("function_name")), set()).update(classes)

    policies = []
    for row in catalog.get("policies", []):
        text = " ".join([
            str(row.get("qual") or ""),
            str(row.get("with_check") or ""),
        ])
        policies.append({
            "schema_name": row.get("schema_name"),
            "table_name": row.get("table_name"),
            "policy_name": row.get("policy_name"),
            "classifications": classify_text(text),
        })

    triggers = []
    function_re = re.compile(r"(?i)EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:\"?public\"?\.)?\"?([A-Za-z_][A-Za-z0-9_]*)\"?")
    for row in catalog.get("triggers", []):
        definition = str(row.get("definition") or "")
        match = function_re.search(definition)
        function_name = match.group(1) if match else None
        inherited = sorted(function_class_by_name.get(function_name or "", set()))
        classes = inherited or classify_text(definition)
        triggers.append({
            "table_name": row.get("table_name"),
            "trigger_name": row.get("trigger_name"),
            "function_name": function_name,
            "classifications": classes,
        })

    counts = Counter()
    for group in (functions, policies, triggers):
        for row in group:
            for name in row["classifications"]:
                counts[name] += 1

    payload: dict[str, Any] = {
        "format_version": 1,
        "source_manifest_sha256": manifest.get("manifest_sha256"),
        "summary_counts": dict(sorted(counts.items())),
        "functions": functions,
        "policies": policies,
        "triggers": triggers,
        "rule": (
            "KEEP_CANDIDATE still requires behavioral review. "
            "No classification authorizes blind production replay."
        ),
        "safety": {
            "database_access": False,
            "rewrites_sql": False,
            "applies_sql": False,
        },
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "functions": len(functions),
        "policies": len(policies),
        "triggers": len(triggers),
        "summary_counts": payload["summary_counts"],
        "output": str(out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
