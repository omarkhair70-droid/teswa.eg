#!/usr/bin/env python3
"""
Capture a deterministic PostgreSQL manifest for Teswa migration verification.

Safety:
- Uses psql only.
- Forces default_transaction_read_only=on.
- Emits no connection string or credentials.
- Never executes DDL/DML.

The manifest is intentionally provider-aware enough to inspect Supabase source
(auth/storage/realtime metadata) while keeping the public application schema as
the primary comparison surface.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database-url-env",
        default="TESWA_DATABASE_URL",
        help="Environment variable containing the PostgreSQL connection string.",
    )
    parser.add_argument("--label", default="postgres", help="Human-readable source/target label.")
    parser.add_argument("--output", required=True, help="Output manifest JSON path.")
    parser.add_argument(
        "--deep",
        action="store_true",
        help="Read every public table to calculate deterministic row and PK-set checksums.",
    )
    parser.add_argument(
        "--statement-timeout-ms",
        type=int,
        default=120000,
        help="Per-statement timeout used through PGOPTIONS.",
    )
    return parser.parse_args()


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


class Psql:
    def __init__(self, database_url: str, statement_timeout_ms: int) -> None:
        self.env = os.environ.copy()
        # Keep the database URL out of argv/process command lines.
        self.env["PGDATABASE"] = database_url
        inherited = self.env.get("PGOPTIONS", "").strip()
        safe_options = (
            f"-c default_transaction_read_only=on "
            f"-c statement_timeout={statement_timeout_ms} "
            f"-c lock_timeout=5000 "
            f"-c idle_in_transaction_session_timeout=30000"
        )
        self.env["PGOPTIONS"] = f"{inherited} {safe_options}".strip()

    def scalar(self, sql: str) -> str:
        proc = subprocess.run(
            ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
            env=self.env,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            stderr = proc.stderr.strip()
            raise RuntimeError(stderr or f"psql exited with {proc.returncode}")
        return proc.stdout.strip()

    def rows(self, select_sql: str) -> list[dict[str, Any]]:
        wrapped = (
            "SELECT COALESCE(json_agg(q), '[]'::json)::text "
            f"FROM ({select_sql}) AS q;"
        )
        raw = self.scalar(wrapped)
        return json.loads(raw or "[]")

    def relation_exists(self, qualified_name: str) -> bool:
        raw = self.scalar(
            "SELECT CASE WHEN to_regclass(" + sql_literal(qualified_name) +
            ") IS NULL THEN '0' ELSE '1' END;"
        )
        return raw == "1"


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def canonical_digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def capture_catalog(psql: Psql) -> dict[str, Any]:
    tables = psql.rows(
        """
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
        """
    )

    columns = psql.rows(
        """
        SELECT
          table_schema AS schema_name,
          table_name,
          ordinal_position,
          column_name,
          data_type,
          udt_schema,
          udt_name,
          is_nullable,
          column_default,
          is_identity,
          identity_generation,
          is_generated,
          generation_expression
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
        """
    )

    views = psql.rows(
        """
        SELECT
          schemaname AS schema_name,
          viewname AS view_name,
          pg_get_viewdef((quote_ident(schemaname) || '.' || quote_ident(viewname))::regclass, true)
            AS definition
        FROM pg_views
        WHERE schemaname = 'public'
        ORDER BY viewname
        """
    )

    enums = psql.rows(
        """
        SELECT
          n.nspname AS schema_name,
          t.typname AS enum_name,
          e.enumsortorder,
          e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.typname, e.enumsortorder
        """
    )

    indexes = psql.rows(
        """
        SELECT
          ns.nspname AS schema_name,
          tbl.relname AS table_name,
          idx.relname AS index_name,
          i.indisunique AS is_unique,
          i.indisprimary AS is_primary,
          pg_get_indexdef(i.indexrelid) AS definition
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        WHERE ns.nspname = 'public'
        ORDER BY tbl.relname, idx.relname
        """
    )

    constraints = psql.rows(
        """
        SELECT
          ns.nspname AS schema_name,
          rel.relname AS table_name,
          con.conname AS constraint_name,
          con.contype AS constraint_type,
          pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'
        ORDER BY rel.relname, con.conname
        """
    )

    functions = psql.rows(
        """
        SELECT
          n.nspname AS schema_name,
          p.proname AS function_name,
          pg_get_function_identity_arguments(p.oid) AS identity_arguments,
          pg_get_function_result(p.oid) AS result_type,
          l.lanname AS language,
          p.prosecdef AS security_definer,
          p.provolatile AS volatility,
          pg_get_userbyid(p.proowner) AS owner_name,
          pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public'
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
        """
    )

    triggers = psql.rows(
        """
        SELECT
          ns.nspname AS schema_name,
          rel.relname AS table_name,
          trg.tgname AS trigger_name,
          pg_get_triggerdef(trg.oid, true) AS definition
        FROM pg_trigger trg
        JOIN pg_class rel ON rel.oid = trg.tgrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'
          AND NOT trg.tgisinternal
        ORDER BY rel.relname, trg.tgname
        """
    )

    policies = psql.rows(
        """
        SELECT
          schemaname AS schema_name,
          tablename AS table_name,
          policyname AS policy_name,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
        ORDER BY schemaname, tablename, policyname
        """
    )

    publication_tables = psql.rows(
        """
        SELECT pubname, schemaname AS schema_name, tablename AS table_name
        FROM pg_publication_tables
        WHERE schemaname = 'public'
        ORDER BY pubname, tablename
        """
    )

    extensions = psql.rows(
        """
        SELECT extname AS extension_name, extversion AS extension_version
        FROM pg_extension
        ORDER BY extname
        """
    )

    primary_keys = psql.rows(
        """
        SELECT
          ns.nspname AS schema_name,
          rel.relname AS table_name,
          array_agg(att.attname ORDER BY key_ord.ordinality) AS columns
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN unnest(con.conkey) WITH ORDINALITY AS key_ord(attnum, ordinality) ON true
        JOIN pg_attribute att
          ON att.attrelid = rel.oid
         AND att.attnum = key_ord.attnum
        WHERE con.contype = 'p'
          AND ns.nspname = 'public'
        GROUP BY ns.nspname, rel.relname
        ORDER BY rel.relname
        """
    )

    foreign_keys = psql.rows(
        """
        SELECT
          src_ns.nspname AS source_schema,
          src.relname AS source_table,
          con.conname AS constraint_name,
          array_agg(src_att.attname ORDER BY key_ord.ordinality) AS source_columns,
          dst_ns.nspname AS target_schema,
          dst.relname AS target_table,
          array_agg(dst_att.attname ORDER BY key_ord.ordinality) AS target_columns,
          con.confupdtype AS update_action_code,
          con.confdeltype AS delete_action_code,
          con.condeferrable AS is_deferrable,
          con.condeferred AS initially_deferred
        FROM pg_constraint con
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
        JOIN pg_class dst ON dst.oid = con.confrelid
        JOIN pg_namespace dst_ns ON dst_ns.oid = dst.relnamespace
        JOIN unnest(con.conkey, con.confkey) WITH ORDINALITY
          AS key_ord(src_attnum, dst_attnum, ordinality) ON true
        JOIN pg_attribute src_att
          ON src_att.attrelid = src.oid
         AND src_att.attnum = key_ord.src_attnum
        JOIN pg_attribute dst_att
          ON dst_att.attrelid = dst.oid
         AND dst_att.attnum = key_ord.dst_attnum
        WHERE con.contype = 'f'
          AND src_ns.nspname = 'public'
        GROUP BY
          src_ns.nspname,
          src.relname,
          con.conname,
          dst_ns.nspname,
          dst.relname,
          con.confupdtype,
          con.confdeltype,
          con.condeferrable,
          con.condeferred
        ORDER BY src.relname, con.conname
        """
    )

    return {
        "tables": tables,
        "columns": columns,
        "views": views,
        "enums": enums,
        "indexes": indexes,
        "constraints": constraints,
        "functions": functions,
        "triggers": triggers,
        "policies": policies,
        "publication_tables": publication_tables,
        "extensions": extensions,
        "primary_keys": primary_keys,
        "foreign_keys": foreign_keys,
    }


def capture_data(psql: Psql, catalog: dict[str, Any], deep: bool) -> dict[str, Any]:
    pk_map = {
        row["table_name"]: row.get("columns") or []
        for row in catalog["primary_keys"]
    }

    result: dict[str, Any] = {}
    for row in catalog["tables"]:
        table_name = row["table_name"]
        relation = f"public.{quote_ident(table_name)}"
        count = int(psql.scalar(f"SELECT count(*)::text FROM {relation};") or "0")
        entry: dict[str, Any] = {
            "row_count": count,
            "pk_columns": pk_map.get(table_name, []),
            "row_checksum_md5": None,
            "pk_set_checksum_md5": None,
        }

        if deep:
            entry["row_checksum_md5"] = psql.scalar(
                "SELECT md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) "
                "FROM ("
                f"SELECT md5(to_jsonb(t)::text) AS row_hash FROM {relation} AS t"
                ") AS rows;"
            )

            pk_cols = entry["pk_columns"]
            if pk_cols:
                json_parts = ", ".join(
                    f"to_jsonb(t) -> {sql_literal(col)}" for col in pk_cols
                )
                pk_expr = f"jsonb_build_array({json_parts})"
                entry["pk_set_checksum_md5"] = psql.scalar(
                    "SELECT md5(COALESCE(string_agg(pk_hash, '' ORDER BY pk_hash), '')) "
                    "FROM ("
                    f"SELECT md5(({pk_expr})::text) AS pk_hash FROM {relation} AS t"
                    ") AS keys;"
                )

        result[table_name] = entry

    return result


def capture_supabase_compat(psql: Psql) -> dict[str, Any]:
    result: dict[str, Any] = {
        "auth": {"available": False},
        "storage": {"available": False},
    }

    if psql.relation_exists("auth.users"):
        auth: dict[str, Any] = {
            "available": True,
            "users": int(psql.scalar("SELECT count(*)::text FROM auth.users;") or "0"),
            "identities": None,
            "providers": [],
        }
        if psql.relation_exists("auth.identities"):
            auth["identities"] = int(
                psql.scalar("SELECT count(*)::text FROM auth.identities;") or "0"
            )
            auth["providers"] = psql.rows(
                """
                SELECT provider, count(*)::bigint AS identity_count
                FROM auth.identities
                GROUP BY provider
                ORDER BY provider
                """
            )
        result["auth"] = auth

    if psql.relation_exists("storage.buckets"):
        storage: dict[str, Any] = {
            "available": True,
            "buckets": psql.rows(
                """
                SELECT id, name, public, file_size_limit, allowed_mime_types
                FROM storage.buckets
                ORDER BY id
                """
            ),
            "objects": [],
        }
        if psql.relation_exists("storage.objects"):
            storage["objects"] = psql.rows(
                """
                SELECT
                  bucket_id,
                  count(*)::bigint AS object_count,
                  COALESCE(sum((metadata ->> 'size')::bigint), 0)::bigint AS total_bytes
                FROM storage.objects
                GROUP BY bucket_id
                ORDER BY bucket_id
                """
            )
        result["storage"] = storage

    return result


def main() -> int:
    args = parse_args()
    database_url = os.environ.get(args.database_url_env)
    if not database_url:
        print(
            f"Missing database URL environment variable: {args.database_url_env}",
            file=sys.stderr,
        )
        return 2

    psql = Psql(database_url, args.statement_timeout_ms)
    server = {
        "server_version_num": psql.scalar("SHOW server_version_num;"),
        "server_version": psql.scalar("SHOW server_version;"),
        "database_name": psql.scalar("SELECT current_database();"),
    }

    catalog = capture_catalog(psql)
    data = capture_data(psql, catalog, args.deep)
    supabase_compat = capture_supabase_compat(psql)

    manifest: dict[str, Any] = {
        "format_version": 2,
        "label": args.label,
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "safety": {
            "read_only": True,
            "deep_row_scan": bool(args.deep),
            "connection_secret_emitted": False,
        },
        "server": server,
        "catalog": catalog,
        "data": {"tables": data},
        "provider_compat": supabase_compat,
    }

    # Digest only stable migration-relevant content, not timestamps/labels/server patch.
    digest_payload = {
        "catalog": catalog,
        "data": manifest["data"],
        "provider_compat": supabase_compat,
    }
    manifest["manifest_sha256"] = canonical_digest(digest_payload)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    summary = {
        "label": args.label,
        "output": str(output),
        "manifest_sha256": manifest["manifest_sha256"],
        "public_tables": len(catalog["tables"]),
        "public_views": len(catalog["views"]),
        "public_enums": len({row["enum_name"] for row in catalog["enums"]}),
        "public_indexes": len(catalog["indexes"]),
        "public_constraints": len(catalog["constraints"]),
        "public_functions": len(catalog["functions"]),
        "public_triggers": len(catalog["triggers"]),
        "public_policies": len(
            [p for p in catalog["policies"] if p["schema_name"] == "public"]
        ),
        "storage_policies": len(
            [p for p in catalog["policies"] if p["schema_name"] == "storage"]
        ),
        "deep": bool(args.deep),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
