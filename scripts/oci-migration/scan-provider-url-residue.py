#!/usr/bin/env python3
"""
Scan public text columns for provider-specific Supabase URLs after migration.

Read-only. By default reports residue without failing.
Use --require-clean when the target design says no Supabase URL compatibility
values may remain.

This is intentionally broader than known media columns so legacy provider URLs
cannot hide in an unexpected public text field.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def qi(value: str) -> str:
    if not IDENT.fullmatch(value):
        raise ValueError(f"Unsafe identifier: {value!r}")
    return '"' + value + '"'


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--database-url-env", default="TESWA_DATABASE_URL")
    p.add_argument("--label", required=True)
    p.add_argument("--report", required=True)
    p.add_argument("--require-clean", action="store_true")
    return p.parse_args()


class Psql:
    def __init__(self, url: str) -> None:
        self.env = os.environ.copy()
        self.env["PGDATABASE"] = url
        inherited = self.env.get("PGOPTIONS", "").strip()
        self.env["PGOPTIONS"] = (
            f"{inherited} -c default_transaction_read_only=on "
            "-c statement_timeout=120000 -c lock_timeout=5000"
        ).strip()

    def scalar(self, sql: str) -> str:
        proc = subprocess.run(
            ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
            env=self.env,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or f"psql exited with {proc.returncode}")
        return proc.stdout.strip()

    def rows(self, sql: str) -> list[dict[str, Any]]:
        raw = self.scalar(
            "SELECT COALESCE(json_agg(q), '[]'::json)::text "
            f"FROM ({sql}) q;"
        )
        return json.loads(raw or "[]")


def main() -> int:
    args = parse_args()
    url = os.environ.get(args.database_url_env)
    if not url:
        print(f"Missing {args.database_url_env}", file=sys.stderr)
        return 2

    psql = Psql(url)
    columns = psql.rows(
        """
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema='public'
          AND data_type IN ('text', 'character varying', 'character')
        ORDER BY table_name, ordinal_position
        """
    )

    patterns = [
        "%supabase.co/storage/v1/object/%",
        "%/storage/v1/object/public/%",
        "%supabase.co/functions/v1/%",
    ]

    findings: list[dict[str, Any]] = []
    total_matches = 0

    for col in columns:
        table = str(col["table_name"])
        column = str(col["column_name"])
        predicates = " OR ".join(
            f"{qi(column)} ILIKE '{pattern.replace("'", "''")}'"
            for pattern in patterns
        )
        count = int(
            psql.scalar(
                f"SELECT count(*)::text FROM {qi('public')}.{qi(table)} "
                f"WHERE {qi(column)} IS NOT NULL AND ({predicates});"
            )
            or "0"
        )
        if count:
            findings.append({
                "table": table,
                "column": column,
                "matching_rows": count,
            })
            total_matches += count

    passed = not args.require_clean or total_matches == 0
    report = {
        "format_version": 1,
        "label": args.label,
        "patterns": patterns,
        "columns_scanned": len(columns),
        "matching_rows_total": total_matches,
        "findings": findings,
        "require_clean": bool(args.require_clean),
        "hard_gate_pass": passed,
        "rule": (
            "A non-zero report is not automatically wrong when a deliberate compatibility URL layer is active. "
            "Production cutover must explicitly choose compatibility or target-only rewrite."
        ),
        "safety": {"read_only": True},
    }

    out = Path(args.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "hard_gate_pass": passed,
        "columns_scanned": len(columns),
        "matching_rows_total": total_matches,
        "report": str(out),
    }, indent=2))
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
