#!/usr/bin/env python3
"""
Scan a raw Supabase public-schema dump for provider-specific portability blockers.

This tool deliberately does NOT rewrite SQL. Automatic text replacement of
auth.uid(), storage policies, pg_net/Vault/cron transport, or provider roles can
silently weaken authorization. Lane 4 uses this report to split KEEP vs REBUILD
objects before an OCI baseline is allowed to apply.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


RULES: list[tuple[str, re.Pattern[str], str]] = [
    (
        "supabase_auth_schema",
        re.compile(r'(?i)(?:"auth"|\bauth)\.'),
        "Supabase Auth schema/function dependency; requires auth-boundary decision.",
    ),
    (
        "supabase_storage_schema",
        re.compile(r'(?i)(?:"storage"|\bstorage)\.'),
        "Supabase Storage schema dependency; rebuild behind Teswa media contract.",
    ),
    (
        "supabase_realtime",
        re.compile(r"(?i)supabase_realtime|realtime\."),
        "Supabase Realtime dependency; rebuild behind Teswa messaging/realtime contract.",
    ),
    (
        "pg_net_http",
        re.compile(r"(?i)\bpg_net\b|\bnet\.http|\bhttp_request\s*\("),
        "Provider-specific database HTTP transport; move to OCI worker/event runtime.",
    ),
    (
        "vault",
        re.compile(r"(?i)\bsupabase_vault\b|(?<![a-z0-9_])vault\."),
        "Supabase Vault dependency; move server secrets to Lane 3 secrets design.",
    ),
    (
        "pg_cron",
        re.compile(r"(?i)\bpg_cron\b|(?<![a-z0-9_])cron\."),
        "Database scheduler dependency; move scheduled behavior to reviewed OCI scheduler/worker.",
    ),
    (
        "supabase_roles",
        re.compile(
            r'(?i)(?:TO|FROM|GRANT\s+[^;]*\s+TO)\s+(?:"?(?:anon|authenticated|service_role)"?)'
        ),
        "Supabase database role dependency; target authorization must be explicit.",
    ),
    (
        "request_jwt_context",
        re.compile(r"(?i)request\.jwt|request\.headers|request\.cookies"),
        "Supabase/PostgREST request context dependency; requires target request identity mapping.",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("sql_file")
    parser.add_argument("--report")
    parser.add_argument(
        "--allow-category",
        action="append",
        default=[],
        help="Mark a reviewed blocker category as non-failing. Repeat as needed.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    path = Path(args.sql_file)
    text = path.read_text(encoding="utf-8", errors="replace")
    allowed = set(args.allow_category)

    findings: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    for line_number, line in enumerate(text.splitlines(), start=1):
        for category, pattern, reason in RULES:
            if pattern.search(line):
                counts[category] = counts.get(category, 0) + 1
                findings.append(
                    {
                        "category": category,
                        "line": line_number,
                        "reason": reason,
                        # Avoid dumping potentially sensitive function bodies into reports.
                        "excerpt": line.strip()[:240],
                        "allowed": category in allowed,
                    }
                )

    blocking_categories = sorted(
        category
        for category, count in counts.items()
        if count > 0 and category not in allowed
    )

    report = {
        "format_version": 1,
        "sql_file": str(path),
        "rules_checked": [category for category, _, _ in RULES],
        "allowed_categories": sorted(allowed),
        "finding_counts": counts,
        "blocking_categories": blocking_categories,
        "portable_gate_pass": not blocking_categories,
        "findings": findings,
        "safety": {
            "rewrites_sql": False,
            "applies_sql": False,
            "connects_to_database": False,
        },
        "next_rule": (
            "Do not apply this raw schema to OCI while blocking categories remain. "
            "Classify affected objects as KEEP/FIX/REBUILD and produce reviewed target SQL."
        ),
    }

    print(
        json.dumps(
            {
                "portable_gate_pass": report["portable_gate_pass"],
                "blocking_categories": blocking_categories,
                "finding_counts": counts,
            },
            indent=2,
        )
    )

    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Report: {out}")

    return 0 if not blocking_categories else 2


if __name__ == "__main__":
    raise SystemExit(main())
