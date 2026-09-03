#!/usr/bin/env python3
"""
Capture a non-PII identity UUID-set fingerprint from any reviewed PostgreSQL
relation/column.

Designed for Teswa auth continuity:
- Supabase source example: auth.users.id
- OCI target example: whatever reviewed identity anchor Lane 2/3 defines

The script is read-only, validates identifier syntax, and emits only aggregate
count + SHA-256 of the sorted identifier set. It does not emit user UUIDs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path


IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--database-url-env", default="TESWA_DATABASE_URL")
    p.add_argument("--schema", required=True)
    p.add_argument("--table", required=True)
    p.add_argument("--column", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--statement-timeout-ms", type=int, default=120000)
    return p.parse_args()


def qi(value: str) -> str:
    if not IDENT.fullmatch(value):
        raise ValueError(f"Unsafe SQL identifier: {value!r}")
    return '"' + value.replace('"', '""') + '"'


def main() -> int:
    args = parse_args()
    database_url = os.environ.get(args.database_url_env)
    if not database_url:
        print(f"Missing {args.database_url_env}", file=sys.stderr)
        return 2

    schema = qi(args.schema)
    table = qi(args.table)
    column = qi(args.column)

    env = os.environ.copy()
    env["PGDATABASE"] = database_url
    inherited = env.get("PGOPTIONS", "").strip()
    env["PGOPTIONS"] = (
        f"{inherited} -c default_transaction_read_only=on "
        f"-c statement_timeout={args.statement_timeout_ms} -c lock_timeout=5000"
    ).strip()

    sql = (
        "SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)::text "
        f"FROM (SELECT DISTINCT {column}::text AS v "
        f"FROM {schema}.{table} WHERE {column} IS NOT NULL) q;"
    )
    proc = subprocess.run(
        ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        env=env,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or f"psql exited with {proc.returncode}")

    values = json.loads(proc.stdout.strip() or "[]")
    digest_input = json.dumps(values, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()

    payload = {
        "format_version": 1,
        "label": args.label,
        "relation": f"{args.schema}.{args.table}",
        "column": args.column,
        "distinct_non_null_count": len(values),
        "uuid_set_sha256": digest,
        "identifiers_emitted": False,
        "read_only": True,
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
