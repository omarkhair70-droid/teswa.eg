#!/usr/bin/env python3
"""Capture Teswa Supabase Storage metadata through the Storage HTTP API.

Source-read-only. Uses one server-side Supabase admin key (legacy service_role
JWT or modern sb_secret key) and never writes credentials to disk/output.
This removes the rehearsal dependency on a direct Postgres connection.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True)
    p.add_argument("--supabase-url-env", default="TESWA_SUPABASE_URL")
    p.add_argument("--admin-key-env", default="TESWA_SUPABASE_ADMIN_KEY")
    p.add_argument("--timeout-seconds", type=int, default=60)
    return p.parse_args()


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def admin_headers(key: str) -> dict[str, str]:
    headers = {
        "apikey": key,
        "User-Agent": "Teswa-Lane4-ReadOnly-Storage-Metadata/2",
        "Accept": "application/json",
    }
    # Modern sb_secret keys are API keys, not JWTs. Legacy service_role keys
    # still use Authorization: Bearer for RLS-bypass compatibility.
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def request_json(url: str, headers: dict[str, str], timeout: int, *, body: dict | None = None) -> Any:
    raw = None
    method = "GET"
    req_headers = dict(headers)
    if body is not None:
        raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
        method = "POST"
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=raw, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status < 200 or resp.status >= 300:
                raise RuntimeError(f"HTTP {resp.status}")
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Supabase Storage metadata request failed: HTTP {exc.code}") from exc


def join_key(prefix: str, name: str) -> str:
    prefix = prefix.strip("/")
    name = name.strip("/")
    if prefix and (name == prefix or name.startswith(prefix + "/")):
        return name
    return f"{prefix}/{name}" if prefix else name


def main() -> int:
    args = parse_args()
    base = os.environ.get(args.supabase_url_env, "").strip().rstrip("/")
    key = os.environ.get(args.admin_key_env, "").strip()
    if not base or not key:
        print(f"Set {args.supabase_url_env} and {args.admin_key_env}.", file=sys.stderr)
        return 2
    if not base.startswith("https://"):
        raise SystemExit("Supabase URL must use https://")

    headers = admin_headers(key)
    buckets_raw = request_json(f"{base}/storage/v1/bucket", headers, args.timeout_seconds)
    if not isinstance(buckets_raw, list):
        raise SystemExit("Unexpected bucket-list response")

    buckets = []
    objects: list[dict[str, Any]] = []
    seen_files: set[tuple[str, str]] = set()

    for bucket in sorted(buckets_raw, key=lambda x: str(x.get("id") or x.get("name") or "")):
        bid = str(bucket.get("id") or bucket.get("name") or "").strip()
        if not bid:
            continue
        queue = [""]
        seen_prefixes = set()
        bucket_count = 0
        bucket_bytes = 0

        while queue:
            prefix = queue.pop(0).strip("/")
            if prefix in seen_prefixes:
                continue
            seen_prefixes.add(prefix)
            offset = 0
            while True:
                body = {
                    "prefix": prefix,
                    "limit": 1000,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                }
                rows = request_json(
                    f"{base}/storage/v1/object/list/{urllib.parse.quote(bid, safe='')}",
                    headers,
                    args.timeout_seconds,
                    body=body,
                )
                if not isinstance(rows, list):
                    raise SystemExit(f"Unexpected object-list response for bucket {bid}")
                for row in rows:
                    name = str(row.get("name") or "").strip("/")
                    if not name:
                        continue
                    full = join_key(prefix, name)
                    if row.get("id") is None:
                        if full not in seen_prefixes:
                            queue.append(full)
                        continue
                    marker = (bid, full)
                    if marker in seen_files:
                        continue
                    seen_files.add(marker)
                    meta = row.get("metadata") or {}
                    size = int(meta.get("size") or 0)
                    objects.append({
                        "bucket": bid,
                        "key": full,
                        "size_bytes": size,
                        "content_sha256": None,
                        "source_provider_etag": meta.get("eTag") or meta.get("etag"),
                        "mime_type": meta.get("mimetype") or meta.get("contentType"),
                        "cache_control": meta.get("cacheControl"),
                        "created_at": row.get("created_at"),
                        "updated_at": row.get("updated_at"),
                    })
                    bucket_count += 1
                    bucket_bytes += size
                if len(rows) < 1000:
                    break
                offset += len(rows)

        buckets.append({
            "id": bid,
            "name": str(bucket.get("name") or bid),
            "source_public": bool(bucket.get("public")),
            "file_size_limit": bucket.get("file_size_limit", bucket.get("fileSizeLimit")),
            "allowed_mime_types": bucket.get("allowed_mime_types", bucket.get("allowedMimeTypes")),
            "object_count": bucket_count,
            "total_bytes": bucket_bytes,
        })

    objects.sort(key=lambda x: (x["bucket"], x["key"]))
    payload = {
        "format_version": 2,
        "provider": "supabase-storage-http",
        "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "safety": {
            "read_only": True,
            "downloads_object_bytes": False,
            "content_hashes_verified": False,
            "credentials_emitted": False,
        },
        "buckets": buckets,
        "objects": objects,
    }
    payload["manifest_sha256"] = canonical_digest({"buckets": buckets, "objects": objects})
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(out),
        "buckets": len(buckets),
        "objects": len(objects),
        "total_bytes": sum(x["total_bytes"] for x in buckets),
        "manifest_sha256": payload["manifest_sha256"],
        "credentials_emitted": False,
        "source_mutation": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
