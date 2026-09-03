#!/usr/bin/env python3
"""
Download every object listed in a Teswa Supabase Storage manifest to a local
migration export and compute SHA-256 from the actual bytes.

Source safety:
- GET requests only
- no Supabase Storage mutation
- credentials are read from environment and never written
- logical bucket/key names are preserved in metadata
- local filenames are opaque hashes to avoid path-traversal/key portability bugs

The resulting hashed manifest is the source side for
compare-storage-manifests.py --require-content-sha256.
"""

from __future__ import annotations

import argparse
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
    p.add_argument("storage_manifest")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--output-manifest", required=True)
    p.add_argument("--supabase-url-env", default="TESWA_SUPABASE_URL")
    p.add_argument("--service-role-key-env", default="TESWA_SUPABASE_SERVICE_ROLE_KEY")
    p.add_argument("--timeout-seconds", type=int, default=120)
    return p.parse_args()


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def object_url(base: str, bucket: str, key: str) -> str:
    encoded_bucket = urllib.parse.quote(bucket, safe="")
    encoded_key = urllib.parse.quote(key, safe="/")
    return f"{base.rstrip('/')}/storage/v1/object/{encoded_bucket}/{encoded_key}"


def local_name(bucket: str, key: str) -> str:
    return hashlib.sha256((bucket + "\0" + key).encode("utf-8")).hexdigest()


def main() -> int:
    args = parse_args()
    source = json.loads(Path(args.storage_manifest).read_text(encoding="utf-8"))

    base_url = os.environ.get(args.supabase_url_env, "").strip()
    service_key = os.environ.get(args.service_role_key_env, "").strip()
    if not base_url or not service_key:
        print(
            f"Set {args.supabase_url_env} and {args.service_role_key_env}.",
            file=sys.stderr,
        )
        return 2

    if not base_url.startswith("https://"):
        print("Supabase URL must use https://", file=sys.stderr)
        return 2

    out_dir = Path(args.output_dir)
    objects_dir = out_dir / "objects"
    objects_dir.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "User-Agent": "Teswa-Lane4-ReadOnly-Storage-Export/1",
    }

    exported: list[dict[str, Any]] = []
    total_bytes = 0

    objects = source.get("objects", [])
    for number, obj in enumerate(objects, start=1):
        bucket = str(obj["bucket"])
        key = str(obj["key"])
        opaque = local_name(bucket, key)
        target = objects_dir / opaque
        temp = objects_dir / (opaque + ".partial")

        request = urllib.request.Request(
            object_url(base_url, bucket, key),
            headers=headers,
            method="GET",
        )

        digest = hashlib.sha256()
        size = 0
        try:
            with urllib.request.urlopen(request, timeout=args.timeout_seconds) as response:
                with temp.open("wb") as handle:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        handle.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
        except urllib.error.HTTPError as exc:
            temp.unlink(missing_ok=True)
            raise SystemExit(
                f"Storage GET failed for {bucket}/{key}: HTTP {exc.code}"
            ) from exc
        except Exception:
            temp.unlink(missing_ok=True)
            raise

        expected = obj.get("size_bytes")
        if expected is not None and int(expected) != size:
            temp.unlink(missing_ok=True)
            raise SystemExit(
                f"Size mismatch while exporting {bucket}/{key}: "
                f"metadata={expected}, downloaded={size}"
            )

        temp.replace(target)
        total_bytes += size

        exported.append(
            {
                **obj,
                "size_bytes": size,
                "content_sha256": digest.hexdigest(),
                "local_relpath": f"objects/{opaque}",
            }
        )

        print(f"[{number}/{len(objects)}] {bucket}/{key} — {size} bytes")

    payload = {
        "format_version": 2,
        "provider": "supabase-storage-byte-export",
        "source_metadata_manifest_sha256": source.get("manifest_sha256"),
        "buckets": source.get("buckets", []),
        "objects": exported,
        "object_count": len(exported),
        "total_bytes": total_bytes,
        "content_hashes_verified": True,
        "credentials_emitted": False,
        "source_mutations": False,
    }
    payload["manifest_sha256"] = canonical_digest(
        {
            "buckets": payload["buckets"],
            "objects": [
                {
                    "bucket": row["bucket"],
                    "key": row["key"],
                    "size_bytes": row["size_bytes"],
                    "content_sha256": row["content_sha256"],
                }
                for row in exported
            ],
        }
    )

    output_manifest = Path(args.output_manifest)
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print()
    print(
        json.dumps(
            {
                "output_manifest": str(output_manifest),
                "output_dir": str(out_dir),
                "objects": len(exported),
                "total_bytes": total_bytes,
                "manifest_sha256": payload["manifest_sha256"],
            },
            indent=2,
        )
    )
    print("No Supabase Storage writes were performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
