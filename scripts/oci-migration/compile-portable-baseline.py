#!/usr/bin/env python3
"""
Compile a reviewed, provider-neutral OCI PostgreSQL baseline from a Teswa
source manifest.

This tool does NOT connect to any database and does NOT apply SQL.

Output layers:
- 00-extensions.sql: only explicitly portable PostgreSQL extensions
- 10-structure.sql: public enums + tables/columns
- 20-integrity.sql: non-FK constraints, non-constraint indexes, views
- 30-public-foreign-keys.sql: public -> public FKs only
- rebuild-review.json: provider/runtime objects that must be rebuilt/reviewed

The compiler intentionally excludes:
- public -> auth/storage/other external-schema FKs
- RLS policies / provider roles
- functions / triggers
- Realtime publications
- Supabase-specific extensions/runtime transport

Those surfaces are semantic migration work, not safe schema text substitution.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


PORTABLE_EXTENSIONS = {"pgcrypto", "uuid-ossp"}
UNSAFE_EXPR = re.compile(
    r"(?i)(?:\bauth\.|\bstorage\.|\bsupabase_realtime\b|\bpg_net\b|"
    r"\bnet\.http|\bvault\.|\bsupabase_vault\b|\bcron\.|"
    r"request\.jwt|request\.headers|request\.cookies|\bservice_role\b)"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", help="Format-v3 PostgreSQL manifest.")
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args()


def qi(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def ql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def qname(schema: str, name: str) -> str:
    return f"{qi(schema)}.{qi(name)}"


def normalized_type(column: dict[str, Any], enum_names: set[str]) -> str:
    data_type = str(column.get("data_type") or "")
    udt_schema = str(column.get("udt_schema") or "")
    udt_name = str(column.get("udt_name") or "")
    formatted = str(column.get("formatted_type") or "").strip()

    if data_type == "USER-DEFINED" and udt_schema == "public" and udt_name in enum_names:
        return qname("public", udt_name)

    if data_type == "ARRAY" and udt_schema == "public" and udt_name.startswith("_"):
        base = udt_name[1:]
        if base in enum_names:
            return qname("public", base) + "[]"

    if not formatted:
        raise ValueError(
            f"Missing formatted_type for {column.get('table_name')}.{column.get('column_name')}"
        )
    return formatted


def column_sql(column: dict[str, Any], enum_names: set[str]) -> str:
    name = qi(str(column["column_name"]))
    type_sql = normalized_type(column, enum_names)
    parts = [name, type_sql]

    is_generated = str(column.get("is_generated") or "NEVER").upper()
    is_identity = str(column.get("is_identity") or "NO").upper()
    default = column.get("column_default")

    if is_generated != "NEVER":
        expr = str(column.get("generation_expression") or "").strip()
        if not expr:
            raise ValueError(
                f"Generated column lacks expression: "
                f"{column.get('table_name')}.{column.get('column_name')}"
            )
        if UNSAFE_EXPR.search(expr):
            raise ValueError(
                f"Unsafe provider dependency in generated expression: "
                f"{column.get('table_name')}.{column.get('column_name')}"
            )
        parts.append(f"GENERATED ALWAYS AS ({expr}) STORED")
    elif is_identity == "YES":
        generation = str(column.get("identity_generation") or "BY DEFAULT").upper()
        if generation not in {"ALWAYS", "BY DEFAULT"}:
            raise ValueError(f"Unsupported identity generation: {generation}")
        parts.append(f"GENERATED {generation} AS IDENTITY")
    elif default is not None:
        default_sql = str(default).strip()
        if UNSAFE_EXPR.search(default_sql):
            raise ValueError(
                f"Unsafe provider dependency in default: "
                f"{column.get('table_name')}.{column.get('column_name')}: {default_sql}"
            )
        parts.append(f"DEFAULT {default_sql}")

    if str(column.get("is_nullable") or "YES").upper() == "NO":
        parts.append("NOT NULL")

    return " ".join(parts)


def write_sql(path: Path, title: str, statements: list[str]) -> None:
    header = [
        f"-- {title}",
        "-- Generated from a read-only Teswa source manifest.",
        "-- Review before applying to any isolated OCI target.",
        "",
        "BEGIN;",
        "",
    ]
    footer = ["", "COMMIT;", ""]
    path.write_text(
        "\n".join(header + statements + footer),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    version = int(manifest.get("format_version") or 0)
    if version < 3:
        raise SystemExit(
            "Manifest format_version >= 3 is required. Re-capture with "
            "capture-postgres-manifest.py."
        )

    catalog = manifest.get("catalog", {})
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    tables = [
        row for row in catalog.get("tables", [])
        if row.get("schema_name") == "public"
    ]
    columns = [
        row for row in catalog.get("columns", [])
        if row.get("schema_name") == "public"
    ]
    enums = [
        row for row in catalog.get("enums", [])
        if row.get("schema_name") == "public"
    ]
    constraints = [
        row for row in catalog.get("constraints", [])
        if row.get("schema_name") == "public"
    ]
    indexes = [
        row for row in catalog.get("indexes", [])
        if row.get("schema_name") == "public"
    ]
    views = [
        row for row in catalog.get("views", [])
        if row.get("schema_name") == "public"
    ]
    foreign_keys = catalog.get("foreign_keys", [])

    enum_labels: dict[str, list[tuple[float, str]]] = defaultdict(list)
    for row in enums:
        enum_labels[str(row["enum_name"])].append(
            (float(row["enumsortorder"]), str(row["enumlabel"]))
        )
    enum_names = set(enum_labels)

    extension_statements: list[str] = []
    portable_extensions: list[str] = []
    excluded_extensions: list[dict[str, Any]] = []
    for ext in catalog.get("extensions", []):
        name = str(ext.get("extension_name") or "")
        if name in PORTABLE_EXTENSIONS:
            portable_extensions.append(name)
            extension_statements.append(
                f"CREATE EXTENSION IF NOT EXISTS {qi(name)};"
            )
        elif name not in {"plpgsql"}:
            excluded_extensions.append(ext)

    structure: list[str] = []
    for enum_name in sorted(enum_labels):
        labels = ", ".join(
            ql(label)
            for _, label in sorted(enum_labels[enum_name], key=lambda item: item[0])
        )
        structure.append(
            f"CREATE TYPE {qname('public', enum_name)} AS ENUM ({labels});"
        )
    if enum_labels:
        structure.append("")

    cols_by_table: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in columns:
        cols_by_table[str(row["table_name"])].append(row)

    for table in sorted(str(row["table_name"]) for row in tables):
        table_columns = sorted(
            cols_by_table.get(table, []),
            key=lambda row: int(row["ordinal_position"]),
        )
        if not table_columns:
            raise ValueError(f"No columns captured for public.{table}")
        rendered = ",\n".join(
            "  " + column_sql(row, enum_names) for row in table_columns
        )
        structure.append(
            f"CREATE TABLE {qname('public', table)} (\n{rendered}\n);"
        )
        structure.append("")

    integrity: list[str] = []
    constraint_backing_indexes = {
        str(row["backing_index_name"])
        for row in constraints
        if row.get("backing_index_name")
    }

    for row in sorted(
        constraints,
        key=lambda r: (str(r["table_name"]), str(r["constraint_name"])),
    ):
        kind = str(row.get("constraint_type") or "")
        if kind == "f":
            continue
        definition = str(row.get("definition") or "").strip()
        if UNSAFE_EXPR.search(definition):
            raise ValueError(
                f"Unsafe provider dependency in constraint "
                f"{row['table_name']}.{row['constraint_name']}"
            )
        integrity.append(
            f"ALTER TABLE {qname('public', str(row['table_name']))} "
            f"ADD CONSTRAINT {qi(str(row['constraint_name']))} {definition};"
        )

    if integrity:
        integrity.append("")

    for row in sorted(
        indexes,
        key=lambda r: (str(r["table_name"]), str(r["index_name"])),
    ):
        index_name = str(row["index_name"])
        if index_name in constraint_backing_indexes:
            continue
        definition = str(row.get("definition") or "").strip()
        if UNSAFE_EXPR.search(definition):
            raise ValueError(
                f"Unsafe provider dependency in index {index_name}"
            )
        if not definition.endswith(";"):
            definition += ";"
        integrity.append(definition)

    if indexes:
        integrity.append("")

    for row in sorted(views, key=lambda r: str(r["view_name"])):
        definition = str(row.get("definition") or "").strip().rstrip(";")
        if UNSAFE_EXPR.search(definition):
            raise ValueError(
                f"Unsafe provider dependency in view {row['view_name']}"
            )
        integrity.append(
            f"CREATE OR REPLACE VIEW {qname('public', str(row['view_name']))} "
            f"AS\n{definition};"
        )

    fk_constraint_map = {
        (str(row["table_name"]), str(row["constraint_name"])): row
        for row in constraints
        if str(row.get("constraint_type") or "") == "f"
    }

    public_fk_statements: list[str] = []
    external_fks: list[dict[str, Any]] = []
    for fk in sorted(
        foreign_keys,
        key=lambda r: (str(r["source_table"]), str(r["constraint_name"])),
    ):
        source_table = str(fk["source_table"])
        constraint_name = str(fk["constraint_name"])
        key = (source_table, constraint_name)
        constraint = fk_constraint_map.get(key)
        if constraint is None:
            raise ValueError(
                f"Missing FK constraint definition for {source_table}.{constraint_name}"
            )

        if fk.get("target_schema") != "public":
            external_fks.append(
                {
                    **fk,
                    "definition": constraint.get("definition"),
                    "classification": "REBUILD",
                    "reason": (
                        "Cross-schema provider identity/storage/runtime anchor. "
                        "Do not replay until the OCI target model is reviewed."
                    ),
                }
            )
            continue

        definition = str(constraint.get("definition") or "").strip()
        if UNSAFE_EXPR.search(definition):
            raise ValueError(
                f"Unsafe provider dependency in public FK "
                f"{source_table}.{constraint_name}"
            )
        public_fk_statements.append(
            f"ALTER TABLE {qname('public', source_table)} "
            f"ADD CONSTRAINT {qi(constraint_name)} {definition};"
        )

    review = {
        "format_version": 1,
        "source_label": manifest.get("label"),
        "source_manifest_sha256": manifest.get("manifest_sha256"),
        "portable_extensions": sorted(portable_extensions),
        "excluded_extensions": excluded_extensions,
        "external_foreign_keys": external_fks,
        "table_security": [
            {
                "table_name": row.get("table_name"),
                "rls_enabled": bool(row.get("rls_enabled")),
                "rls_forced": bool(row.get("rls_forced")),
                "classification": "REBUILD_OR_PRESERVE_SEMANTICS",
            }
            for row in tables
        ],
        "functions": [
            {
                "function_name": row.get("function_name"),
                "identity_arguments": row.get("identity_arguments"),
                "security_definer": row.get("security_definer"),
                "classification": "REVIEW_KEEP_OR_REBUILD",
            }
            for row in catalog.get("functions", [])
        ],
        "triggers": [
            {
                "table_name": row.get("table_name"),
                "trigger_name": row.get("trigger_name"),
                "classification": "REVIEW_KEEP_OR_REBUILD",
            }
            for row in catalog.get("triggers", [])
        ],
        "policies": [
            {
                "schema_name": row.get("schema_name"),
                "table_name": row.get("table_name"),
                "policy_name": row.get("policy_name"),
                "classification": "REBUILD_AUTHORIZATION_SEMANTICS",
            }
            for row in catalog.get("policies", [])
        ],
        "publication_tables": [
            {
                **row,
                "classification": "REBUILD_REALTIME_SEMANTICS",
            }
            for row in catalog.get("publication_tables", [])
        ],
        "safety": {
            "connects_to_database": False,
            "applies_sql": False,
            "includes_external_fks": False,
            "includes_functions": False,
            "includes_triggers": False,
            "includes_policies": False,
            "includes_publications": False,
        },
    }

    write_sql(
        out / "00-extensions.sql",
        "Teswa OCI portable extensions",
        extension_statements,
    )
    write_sql(
        out / "10-structure.sql",
        "Teswa OCI portable enums and public tables",
        structure,
    )
    write_sql(
        out / "20-integrity.sql",
        "Teswa OCI portable non-FK constraints, indexes and views",
        integrity,
    )
    write_sql(
        out / "30-public-foreign-keys.sql",
        "Teswa OCI public-to-public foreign keys",
        public_fk_statements,
    )
    (out / "rebuild-review.json").write_text(
        json.dumps(review, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    summary = {
        "output_dir": str(out),
        "tables": len(tables),
        "enums": len(enum_names),
        "portable_extensions": len(portable_extensions),
        "non_fk_constraints": len(
            [row for row in constraints if row.get("constraint_type") != "f"]
        ),
        "public_foreign_keys": len(public_fk_statements),
        "external_foreign_keys": len(external_fks),
        "functions_deferred": len(catalog.get("functions", [])),
        "triggers_deferred": len(catalog.get("triggers", [])),
        "policies_deferred": len(catalog.get("policies", [])),
        "publications_deferred": len(catalog.get("publication_tables", [])),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
