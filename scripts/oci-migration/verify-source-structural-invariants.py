#!/usr/bin/env python3
"""Fail-closed Lane 4 structural gate for the live Supabase source manifest.

This verifier is offline: it reads a previously captured read-only manifest and
performs no database or OCI operations.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

EXPECTED_ENUMS = {
    "deal_status",
    "discovery_example_type",
    "item_condition",
    "item_desire_mode",
    "item_source",
    "item_status",
    "notification_type",
    "offer_event_type",
    "offer_redirect_type",
    "offer_status",
    "report_reason",
    "report_status",
}

EXPECTED_PUBLICATIONS = {
    "deal_message_reads",
    "deal_messages",
    "direct_message_attachments",
    "direct_message_reactions",
    "direct_messages",
    "direct_typing_state",
}

EXPECTED = {
    "tables": 46,
    "views": 1,
    "indexes": 188,
    "constraints": 249,
    "foreign_keys": 104,
    "public_foreign_keys": 83,
    "external_foreign_keys": 21,
    "functions": 80,
    "triggers": 23,
    "public_policies": 99,
    "storage_policies": 29,
    "primary_keys": 46,
    "storage_buckets": 9,
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("manifest")
    p.add_argument("--report")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    catalog = manifest.get("catalog", {})
    compat = manifest.get("provider_compat", {})

    tables = [x for x in catalog.get("tables", []) if x.get("schema_name") == "public"]
    views = [x for x in catalog.get("views", []) if x.get("schema_name") == "public"]
    indexes = [x for x in catalog.get("indexes", []) if x.get("schema_name") == "public"]
    constraints = [x for x in catalog.get("constraints", []) if x.get("schema_name") == "public"]
    fks = [x for x in catalog.get("foreign_keys", []) if x.get("source_schema") == "public"]
    functions = [x for x in catalog.get("functions", []) if x.get("schema_name") == "public"]
    triggers = [x for x in catalog.get("triggers", []) if x.get("schema_name") == "public"]
    policies = catalog.get("policies", [])
    primary_keys = [x for x in catalog.get("primary_keys", []) if x.get("schema_name") == "public"]
    enums = {x.get("enum_name") for x in catalog.get("enums", []) if x.get("schema_name") == "public"}
    publication_tables = {
        x.get("table_name")
        for x in catalog.get("publication_tables", [])
        if x.get("schema_name") == "public"
    }

    actual = {
        "tables": len(tables),
        "views": len(views),
        "indexes": len(indexes),
        "constraints": len(constraints),
        "foreign_keys": len(fks),
        "public_foreign_keys": len([x for x in fks if x.get("target_schema") == "public"]),
        "external_foreign_keys": len([x for x in fks if x.get("target_schema") != "public"]),
        "functions": len(functions),
        "triggers": len(triggers),
        "public_policies": len([x for x in policies if x.get("schema_name") == "public"]),
        "storage_policies": len([x for x in policies if x.get("schema_name") == "storage"]),
        "primary_keys": len(primary_keys),
        "storage_buckets": len((compat.get("storage") or {}).get("buckets", []))
        if (compat.get("storage") or {}).get("available")
        else None,
    }

    failures: list[str] = []
    for key, expected in EXPECTED.items():
        if actual.get(key) != expected:
            failures.append(f"{key}: expected {expected}, got {actual.get(key)}")

    table_names = {x.get("table_name") for x in tables}
    pk_names = {x.get("table_name") for x in primary_keys}
    missing_pks = sorted(table_names - pk_names)
    if missing_pks:
        failures.append("tables_without_primary_key=" + ",".join(missing_pks))

    rls_disabled = sorted(x.get("table_name") for x in tables if not x.get("rls_enabled"))
    if rls_disabled:
        failures.append("source_rls_disabled=" + ",".join(rls_disabled))

    if {x.get("view_name") for x in views} != {"marketplace_items"}:
        failures.append("unexpected_public_view_set")

    if enums != EXPECTED_ENUMS:
        failures.append(
            "enum_set_drift=" + json.dumps(
                {
                    "missing": sorted(EXPECTED_ENUMS - enums),
                    "extra": sorted(enums - EXPECTED_ENUMS),
                },
                sort_keys=True,
            )
        )

    if publication_tables != EXPECTED_PUBLICATIONS:
        failures.append(
            "realtime_publication_set_drift=" + json.dumps(
                {
                    "missing": sorted(EXPECTED_PUBLICATIONS - publication_tables),
                    "extra": sorted(publication_tables - EXPECTED_PUBLICATIONS),
                },
                sort_keys=True,
            )
        )

    bad_external = sorted(
        f"{x.get('source_table')}.{x.get('constraint_name')}->{x.get('target_schema')}.{x.get('target_table')}"
        for x in fks
        if x.get("target_schema") != "public"
        and not (x.get("target_schema") == "auth" and x.get("target_table") == "users")
    )
    if bad_external:
        failures.append("unexpected_external_fk_targets=" + ",".join(bad_external))

    nonportable_generation = []
    for col in catalog.get("columns", []):
        if col.get("schema_name") != "public":
            continue
        if str(col.get("is_identity") or "NO").upper() == "YES":
            nonportable_generation.append(f"{col.get('table_name')}.{col.get('column_name')}:identity")
        if str(col.get("is_generated") or "NEVER").upper() != "NEVER":
            nonportable_generation.append(f"{col.get('table_name')}.{col.get('column_name')}:generated")
        if "nextval(" in str(col.get("column_default") or "").lower():
            nonportable_generation.append(f"{col.get('table_name')}.{col.get('column_name')}:sequence_default")
    if nonportable_generation:
        failures.append("unexpected_generated_columns=" + ",".join(sorted(nonportable_generation)))

    server_version_num = int((manifest.get("server") or {}).get("server_version_num") or 0)
    if server_version_num // 10000 != 17:
        failures.append(f"source_postgres_major: expected 17, got {server_version_num // 10000}")

    report: dict[str, Any] = {
        "format_version": 1,
        "manifest_sha256": manifest.get("manifest_sha256"),
        "source_postgres_version_num": server_version_num,
        "expected": EXPECTED,
        "actual": actual,
        "enum_names": sorted(enums),
        "publication_tables": sorted(publication_tables),
        "source_rls_disabled": rls_disabled,
        "tables_without_primary_key": missing_pks,
        "unexpected_external_fk_targets": bad_external,
        "failures": failures,
        "lane4_source_structural_gate": "FAIL" if failures else "PASS",
        "safety": {
            "database_connection": False,
            "source_mutation": False,
            "target_mutation": False,
            "data_transfer": False,
            "production_cutover": False,
        },
    }

    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
