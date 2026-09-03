#!/usr/bin/env python3
"""
Compare Teswa PostgreSQL migration manifests.

Hard gates:
- public tables/columns/views/enums/indexes/constraints
- table row counts
- deep row checksums when --require-deep is used
- primary-key set checksums when available

Provider-runtime surfaces are always reported because OCI may intentionally
rebuild them behind Teswa-owned boundaries:
- functions
- triggers
- RLS/storage policies
- realtime publication tables
- extensions
- Supabase auth/storage provider metadata

Use --strict-provider-runtime only when exact SQL/provider parity is expected.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


STRUCTURAL_KEYS = (
    "tables",
    "columns",
    "views",
    "enums",
    "indexes",
    "constraints",
)

PROVIDER_RUNTIME_KEYS = (
    "functions",
    "triggers",
    "policies",
    "publication_tables",
    "extensions",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument(
        "--report",
        help="Optional JSON report path.",
    )
    parser.add_argument(
        "--require-deep",
        action="store_true",
        help="Fail unless both manifests include deep row checksums and those checksums match.",
    )
    parser.add_argument(
        "--strict-provider-runtime",
        action="store_true",
        help="Also make functions/triggers/policies/publications/extensions exact hard gates.",
    )
    return parser.parse_args()


def load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def same(a: Any, b: Any) -> bool:
    return canonical(a) == canonical(b)


def keyed_diff(source_rows: list[dict[str, Any]], target_rows: list[dict[str, Any]], keys: tuple[str, ...]) -> dict[str, Any]:
    def row_key(row: dict[str, Any]) -> str:
        return "|".join(str(row.get(k)) for k in keys)

    src = {row_key(row): row for row in source_rows}
    dst = {row_key(row): row for row in target_rows}

    missing = sorted(set(src) - set(dst))
    extra = sorted(set(dst) - set(src))
    changed = sorted(
        key for key in set(src) & set(dst)
        if not same(src[key], dst[key])
    )

    return {
        "match": not missing and not extra and not changed,
        "missing_in_target": missing,
        "extra_in_target": extra,
        "changed": changed,
    }


def catalog_diff(key: str, source: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    key_columns: dict[str, tuple[str, ...]] = {
        "tables": ("schema_name", "table_name"),
        "columns": ("schema_name", "table_name", "ordinal_position", "column_name"),
        "views": ("schema_name", "view_name"),
        "enums": ("schema_name", "enum_name", "enumsortorder"),
        "indexes": ("schema_name", "table_name", "index_name"),
        "constraints": ("schema_name", "table_name", "constraint_name"),
        "functions": ("schema_name", "function_name", "identity_arguments"),
        "triggers": ("schema_name", "table_name", "trigger_name"),
        "policies": ("schema_name", "table_name", "policy_name"),
        "publication_tables": ("pubname", "schema_name", "table_name"),
        "extensions": ("extension_name",),
    }
    return keyed_diff(
        source.get("catalog", {}).get(key, []),
        target.get("catalog", {}).get(key, []),
        key_columns[key],
    )


def data_diff(source: dict[str, Any], target: dict[str, Any], require_deep: bool) -> dict[str, Any]:
    src_tables = source.get("data", {}).get("tables", {})
    dst_tables = target.get("data", {}).get("tables", {})
    names = sorted(set(src_tables) | set(dst_tables))

    missing = sorted(set(src_tables) - set(dst_tables))
    extra = sorted(set(dst_tables) - set(src_tables))
    row_count_mismatch: list[dict[str, Any]] = []
    row_checksum_mismatch: list[dict[str, Any]] = []
    pk_checksum_mismatch: list[dict[str, Any]] = []
    deep_missing: list[str] = []

    for name in sorted(set(src_tables) & set(dst_tables)):
        src = src_tables[name]
        dst = dst_tables[name]

        if src.get("row_count") != dst.get("row_count"):
            row_count_mismatch.append({
                "table": name,
                "source": src.get("row_count"),
                "target": dst.get("row_count"),
            })

        src_row = src.get("row_checksum_md5")
        dst_row = dst.get("row_checksum_md5")
        if require_deep and (not src_row or not dst_row):
            deep_missing.append(name)
        elif src_row is not None and dst_row is not None and src_row != dst_row:
            row_checksum_mismatch.append({
                "table": name,
                "source": src_row,
                "target": dst_row,
            })

        src_pk = src.get("pk_set_checksum_md5")
        dst_pk = dst.get("pk_set_checksum_md5")
        if src_pk is not None and dst_pk is not None and src_pk != dst_pk:
            pk_checksum_mismatch.append({
                "table": name,
                "source": src_pk,
                "target": dst_pk,
            })

    match = not (
        missing
        or extra
        or row_count_mismatch
        or row_checksum_mismatch
        or pk_checksum_mismatch
        or deep_missing
    )

    return {
        "match": match,
        "tables_seen": names,
        "missing_in_target": missing,
        "extra_in_target": extra,
        "row_count_mismatch": row_count_mismatch,
        "row_checksum_mismatch": row_checksum_mismatch,
        "pk_set_checksum_mismatch": pk_checksum_mismatch,
        "deep_checksum_missing": deep_missing,
    }


def provider_compat_diff(source: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    src = source.get("provider_compat", {})
    dst = target.get("provider_compat", {})
    return {
        "match": same(src, dst),
        "source": src,
        "target": dst,
        "note": (
            "Provider metadata is informational during OCI rebuild. "
            "Do not require Supabase auth/storage internals to exist on OCI."
        ),
    }


def summarize_category(name: str, result: dict[str, Any]) -> str:
    state = "PASS" if result.get("match") else "DIFF"
    return f"{state:4} {name}"


def main() -> int:
    args = parse_args()
    source = load(args.source)
    target = load(args.target)

    report: dict[str, Any] = {
        "source": {
            "label": source.get("label"),
            "manifest_sha256": source.get("manifest_sha256"),
            "deep": source.get("safety", {}).get("deep_row_scan"),
        },
        "target": {
            "label": target.get("label"),
            "manifest_sha256": target.get("manifest_sha256"),
            "deep": target.get("safety", {}).get("deep_row_scan"),
        },
        "hard_gates": {},
        "provider_runtime_review": {},
        "provider_compat_review": {},
    }

    hard_failed = False

    for key in STRUCTURAL_KEYS:
        diff = catalog_diff(key, source, target)
        report["hard_gates"][key] = diff
        if not diff["match"]:
            hard_failed = True

    data = data_diff(source, target, args.require_deep)
    report["hard_gates"]["data"] = data
    if not data["match"]:
        hard_failed = True

    for key in PROVIDER_RUNTIME_KEYS:
        diff = catalog_diff(key, source, target)
        report["provider_runtime_review"][key] = diff
        if args.strict_provider_runtime and not diff["match"]:
            hard_failed = True

    compat = provider_compat_diff(source, target)
    report["provider_compat_review"] = compat

    report["result"] = {
        "hard_gate_pass": not hard_failed,
        "strict_provider_runtime": bool(args.strict_provider_runtime),
        "require_deep": bool(args.require_deep),
    }

    print("Teswa Supabase -> OCI manifest comparison")
    print()
    for key, diff in report["hard_gates"].items():
        print(summarize_category(key, diff))
    print()
    for key, diff in report["provider_runtime_review"].items():
        suffix = " [HARD]" if args.strict_provider_runtime else " [REVIEW]"
        print(summarize_category(key, diff) + suffix)
    print()
    print(
        "PASS hard migration gates"
        if not hard_failed
        else "FAIL hard migration gates"
    )

    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Report: {out}")

    return 0 if not hard_failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
