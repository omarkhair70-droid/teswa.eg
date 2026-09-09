#!/usr/bin/env python3
"""
Validate foreign-key orphan state against a Teswa PostgreSQL manifest.

Safety:
- read-only queries only
- target/source URL read from an environment variable
- no constraints are disabled
- no rows are modified

By default validates public -> public FKs.
Use --include-external when the target identity/storage anchor relations exist
and are intentionally part of the reviewed target model.
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
        raise ValueError(f"Unsafe SQL identifier: {value!r}")
    return '"' + value.replace('"', '""') + '"'


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("manifest")
    p.add_argument("--database-url-env", default="TESWA_DATABASE_URL")
    p.add_argument("--include-external", action="store_true")
    p.add_argument("--report")
    p.add_argument("--statement-timeout-ms", type=int, default=120000)
    return p.parse_args()


class Psql:
    def __init__(self, url: str, timeout_ms: int) -> None:
        self.env = os.environ.copy()
        self.env["PGDATABASE"] = url
        inherited = self.env.get("PGOPTIONS", "").strip()
        self.env["PGOPTIONS"] = (
            f"{inherited} -c default_transaction_read_only=on "
            f"-c statement_timeout={timeout_ms} -c lock_timeout=5000"
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

    def relation_exists(self, schema: str, table: str) -> bool:
        reg = f"{schema}.{table}".replace("'", "''")
        return self.scalar(
            f"SELECT CASE WHEN to_regclass('{reg}') IS NULL THEN '0' ELSE '1' END;"
        ) == "1"


def build_orphan_sql(fk: dict[str, Any]) -> str:
    source_schema = str(fk.get("source_schema") or "public")
    source_table = str(fk["source_table"])
    target_schema = str(fk["target_schema"])
    target_table = str(fk["target_table"])
    source_columns = [str(x) for x in fk.get("source_columns") or []]
    target_columns = [str(x) for x in fk.get("target_columns") or []]

    if not source_columns or len(source_columns) != len(target_columns):
        raise ValueError(
            f"Invalid FK column mapping for {source_table}.{fk.get('constraint_name')}"
        )

    match_type = str(fk.get("match_type_code") or "s")
    src_non_null = [f"s.{qi(col)} IS NOT NULL" for col in source_columns]

    if match_type == "f":  # MATCH FULL
        # A valid non-null key requires every referencing column non-null.
        qualifying = " AND ".join(src_non_null)
    else:  # MATCH SIMPLE / PARTIAL (Postgres effectively supports SIMPLE/FULL)
        # Under MATCH SIMPLE, any null exempts the row from FK matching.
        qualifying = " AND ".join(src_non_null)

    equality = " AND ".join(
        f"t.{qi(dst)} = s.{qi(src)}"
        for src, dst in zip(source_columns, target_columns)
    )

    return (
        "SELECT count(*)::text "
        f"FROM {qi(source_schema)}.{qi(source_table)} s "
        f"WHERE {qualifying} "
        "AND NOT EXISTS ("
        f"SELECT 1 FROM {qi(target_schema)}.{qi(target_table)} t "
        f"WHERE {equality}"
        ");"
    )


def main() -> int:
    args = parse_args()
    url = os.environ.get(args.database_url_env)
    if not url:
        print(f"Missing {args.database_url_env}", file=sys.stderr)
        return 2

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    fks = manifest.get("catalog", {}).get("foreign_keys", [])
    psql = Psql(url, args.statement_timeout_ms)

    results: list[dict[str, Any]] = []
    failures = 0
    skipped = 0

    for fk in fks:
        external = fk.get("target_schema") != "public"
        if external and not args.include_external:
            results.append(
                {
                    "constraint_name": fk.get("constraint_name"),
                    "source_table": fk.get("source_table"),
                    "target_schema": fk.get("target_schema"),
                    "target_table": fk.get("target_table"),
                    "status": "skipped_external",
                    "orphan_count": None,
                }
            )
            skipped += 1
            continue

        source_schema = str(fk.get("source_schema") or "public")
        source_table = str(fk.get("source_table"))
        target_schema = str(fk.get("target_schema"))
        target_table = str(fk.get("target_table"))

        if not psql.relation_exists(source_schema, source_table):
            results.append(
                {
                    "constraint_name": fk.get("constraint_name"),
                    "source_table": source_table,
                    "target_schema": target_schema,
                    "target_table": target_table,
                    "status": "missing_source_relation",
                    "orphan_count": None,
                }
            )
            failures += 1
            continue

        if not psql.relation_exists(target_schema, target_table):
            results.append(
                {
                    "constraint_name": fk.get("constraint_name"),
                    "source_table": source_table,
                    "target_schema": target_schema,
                    "target_table": target_table,
                    "status": "missing_target_relation",
                    "orphan_count": None,
                }
            )
            failures += 1
            continue

        count = int(psql.scalar(build_orphan_sql(fk)) or "0")
        status = "pass" if count == 0 else "orphaned"
        if count:
            failures += 1

        results.append(
            {
                "constraint_name": fk.get("constraint_name"),
                "source_table": source_table,
                "target_schema": target_schema,
                "target_table": target_table,
                "status": status,
                "orphan_count": count,
            }
        )

    report = {
        "format_version": 1,
        "source_manifest_sha256": manifest.get("manifest_sha256"),
        "include_external": bool(args.include_external),
        "foreign_keys_seen": len(fks),
        "foreign_keys_skipped": skipped,
        "failures": failures,
        "hard_gate_pass": failures == 0,
        "results": results,
        "safety": {
            "read_only": True,
            "modifies_constraints": False,
            "modifies_rows": False,
        },
    }

    print(
        json.dumps(
            {
                "hard_gate_pass": report["hard_gate_pass"],
                "foreign_keys_seen": len(fks),
                "skipped": skipped,
                "failures": failures,
            },
            indent=2,
        )
    )

    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Report: {out}")

    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
