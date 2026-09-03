#!/usr/bin/env python3
"""
Download the OCI objects recorded by upload-storage-to-oci.py and hash the
actual target bytes.

This is OCI-target read-only. It emits a normalized storage manifest compatible
with compare-storage-manifests.py --require-content-sha256.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("upload_record")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--output-manifest", required=True)
    p.add_argument("--oci-profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    return p.parse_args()


def run(args: list[str]) -> None:
    proc = subprocess.run(args)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {proc.returncode}")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    record = json.loads(Path(args.upload_record).read_text(encoding="utf-8"))
    namespace = str(record.get("namespace") or "")
    if not namespace:
        raise SystemExit("Upload record has no OCI namespace.")

    out_dir = Path(args.output_dir)
    objects_dir = out_dir / "objects"
    objects_dir.mkdir(parents=True, exist_ok=True)

    target_objects: list[dict[str, Any]] = []
    objects = record.get("objects", [])

    for number, obj in enumerate(objects, start=1):
        logical_bucket = str(obj["bucket"])
        key = str(obj["key"])
        target_bucket = str(obj["target_bucket"])
        target_name = str(obj["target_object_name"])
        opaque = hashlib.sha256(
            (target_bucket + "\0" + target_name).encode("utf-8")
        ).hexdigest()
        local_file = objects_dir / opaque

        print(f"[{number}/{len(objects)}] GET {target_bucket}/{target_name}")
        run(
            [
                "oci", "--profile", args.oci_profile,
                "os", "object", "get",
                "--namespace-name", namespace,
                "--bucket-name", target_bucket,
                "--name", target_name,
                "--file", str(local_file),
            ]
        )

        size = local_file.stat().st_size
        target_objects.append(
            {
                "bucket": logical_bucket,
                "key": key,
                "size_bytes": size,
                "content_sha256": file_sha256(local_file),
                "target_bucket": target_bucket,
                "target_object_name": target_name,
                "local_relpath": f"objects/{opaque}",
            }
        )

    payload = {
        "format_version": 2,
        "provider": "oci-object-storage-byte-export",
        "objects": target_objects,
        "object_count": len(target_objects),
        "total_bytes": sum(int(row["size_bytes"]) for row in target_objects),
        "content_hashes_verified": True,
        "target_mutations": False,
    }

    out = Path(args.output_manifest)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OCI byte manifest: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
