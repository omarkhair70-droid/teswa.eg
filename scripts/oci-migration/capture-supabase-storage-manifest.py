#!/usr/bin/env python3
"""
Capture Teswa Supabase Storage metadata without downloading object bytes.

This script is source-read-only. It queries storage.buckets/storage.objects via
PostgreSQL and emits a normalized object manifest for later OCI copy/verification.

Content SHA-256 is intentionally null because database metadata is not proof of
object bytes. A later byte-copy/hash step must populate/verify content hashes.
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
        default="TESWA_SOURCE_DATABASE_URL",
        help="Environment variable containing the source PostgreSQL URL.",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--statement-timeout-ms", type=int, default=120000)
    return parser.parse_args()


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class Psql:
    def __init__(self, database_url: str, timeout_ms: int) -> None:
        self.env = os.environ.copy()
        self.env["PGDATABASE"] = database_url
        inherited = self.env.get("PGOPTIONS", "").strip()
        options = (
            f"-c default_transaction_read_only=on "
            f"-c statement_timeout={timeout_ms} "
            f"-c lock_timeout=5000"
        )
        self.env["PGOPTIONS"] = f"{inherited} {options}".strip()

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
            f"FROM ({sql}) AS q;"
        )
        return json.loads(raw or "[]")


def main() -> int:
    args = parse_args()
    database_url = os.environ.get(args.database_url_env)
    if not database_url:
        print(f"Missing {args.database_url_env}", file=sys.stderr)
        return 2

    psql = Psql(database_url, args.statement_timeout_ms)

    exists = psql.scalar(
        "SELECT CASE WHEN to_regclass('storage.objects') IS NOT NULL "
        "AND to_regclass('storage.buckets') IS NOT NULL THEN '1' ELSE '0' END;"
    )
    if exists != "1":
        print("storage.buckets/storage.objects are unavailable.", file=sys.stderr)
        return 3

    buckets = psql.rows(
        """
        SELECT
          id,
          name,
          public,
          file_size_limit,
          allowed_mime_types
        FROM storage.buckets
        ORDER BY id
        """
    )

    objects = psql.rows(
        """
        SELECT
          bucket_id AS bucket,
          name AS object_key,
          COALESCE((metadata ->> 'size')::bigint, 0)::bigint AS size_bytes,
          COALESCE(metadata ->> 'eTag', metadata ->> 'etag') AS provider_etag,
          metadata ->> 'mimetype' AS mime_type,
          metadata ->> 'cacheControl' AS cache_control,
          created_at,
          updated_at
        FROM storage.objects
        ORDER BY bucket_id, name
        """
    )

    normalized_objects = [
        {
            "bucket": row["bucket"],
            "key": row["object_key"],
            "size_bytes": int(row.get("size_bytes") or 0),
            "content_sha256": None,
            "source_provider_etag": row.get("provider_etag"),
            "mime_type": row.get("mime_type"),
            "cache_control": row.get("cache_control"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }
        for row in objects
    ]

    bucket_summary: dict[str, dict[str, int]] = {
        row["id"]: {"object_count": 0, "total_bytes": 0}
        for row in buckets
    }
    for obj in normalized_objects:
        summary = bucket_summary.setdefault(
            obj["bucket"], {"object_count": 0, "total_bytes": 0}
        )
        summary["object_count"] += 1
        summary["total_bytes"] += obj["size_bytes"]

    payload = {
        "format_version": 1,
        "provider": "supabase-storage",
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "safety": {
            "read_only": True,
            "downloads_object_bytes": False,
            "content_hashes_verified": False,
        },
        "buckets": [
            {
                "id": row["id"],
                "name": row["name"],
                "source_public": bool(row["public"]),
                "file_size_limit": row.get("file_size_limit"),
                "allowed_mime_types": row.get("allowed_mime_types"),
                **bucket_summary.get(row["id"], {"object_count": 0, "total_bytes": 0}),
            }
            for row in buckets
        ],
        "objects": normalized_objects,
    }
    payload["manifest_sha256"] = canonical_digest(
        {"buckets": payload["buckets"], "objects": payload["objects"]}
    )

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "output": str(out),
                "buckets": len(payload["buckets"]),
                "objects": len(normalized_objects),
                "total_bytes": sum(row["total_bytes"] for row in payload["buckets"]),
                "manifest_sha256": payload["manifest_sha256"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
