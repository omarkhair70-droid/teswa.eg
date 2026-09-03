#!/usr/bin/env python3
"""
Upload a hashed Teswa Storage export to pre-created OCI Object Storage buckets.

This is target-mutating and intentionally refuses to create buckets.
Hard safety gates:
- TESWA_ALLOW_TARGET_WRITE=YES
- TESWA_OCI_STORAGE_ASSERTION=YES
- TESWA_OCI_COMPARTMENT_OCID must match every target bucket
- every logical source bucket must have an explicit mapping

Bucket-map format:
{
  "profile-images": {"bucket": "teswa-media", "prefix": "profile-images"},
  "item-images": {"bucket": "teswa-media", "prefix": "item-images"}
}

The logical Supabase key is preserved. Optional target prefixes are physical
layout only and must not leak back into feature code.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("hashed_manifest")
    p.add_argument("--export-dir", required=True)
    p.add_argument("--bucket-map", required=True)
    p.add_argument("--output-manifest", required=True)
    p.add_argument("--oci-profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    return p.parse_args()


def run_json(args: list[str]) -> dict[str, Any]:
    proc = subprocess.run(args, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Command failed: {' '.join(args)}")
    return json.loads(proc.stdout or "{}")


def run(args: list[str]) -> None:
    proc = subprocess.run(args)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {proc.returncode}")


def physical_name(prefix: str | None, key: str) -> str:
    clean = (prefix or "").strip("/")
    return f"{clean}/{key}" if clean else key


def main() -> int:
    args = parse_args()

    if os.environ.get("TESWA_ALLOW_TARGET_WRITE") != "YES":
        print("Refusing target writes. Set TESWA_ALLOW_TARGET_WRITE=YES.", file=sys.stderr)
        return 2
    if os.environ.get("TESWA_OCI_STORAGE_ASSERTION") != "YES":
        print("Refusing OCI Storage writes. Set TESWA_OCI_STORAGE_ASSERTION=YES.", file=sys.stderr)
        return 2

    expected_compartment = os.environ.get("TESWA_OCI_COMPARTMENT_OCID", "").strip()
    if not expected_compartment:
        print("Set TESWA_OCI_COMPARTMENT_OCID.", file=sys.stderr)
        return 2

    source = json.loads(Path(args.hashed_manifest).read_text(encoding="utf-8"))
    mapping = json.loads(Path(args.bucket_map).read_text(encoding="utf-8"))
    export_dir = Path(args.export_dir)

    if not source.get("content_hashes_verified"):
        raise SystemExit("Source manifest does not prove byte-level SHA-256 hashes.")

    namespace_payload = run_json(
        ["oci", "--profile", args.oci_profile, "os", "ns", "get", "--output", "json"]
    )
    namespace = namespace_payload.get("data")
    if not isinstance(namespace, str) or not namespace:
        raise SystemExit("Could not resolve OCI Object Storage namespace.")

    logical_buckets = sorted({str(row["bucket"]) for row in source.get("objects", [])})
    missing_maps = [bucket for bucket in logical_buckets if bucket not in mapping]
    if missing_maps:
        raise SystemExit("Missing bucket mappings: " + ", ".join(missing_maps))

    checked_physical: dict[str, dict[str, Any]] = {}
    for logical in logical_buckets:
        config = mapping[logical]
        physical = str(config.get("bucket") or "").strip()
        if not physical:
            raise SystemExit(f"Mapping for {logical} has no target bucket.")

        if physical in checked_physical:
            continue

        bucket_payload = run_json(
            [
                "oci", "--profile", args.oci_profile,
                "os", "bucket", "get",
                "--namespace-name", namespace,
                "--bucket-name", physical,
                "--output", "json",
            ]
        )
        bucket = bucket_payload.get("data") or {}
        actual_compartment = bucket.get("compartment-id")
        if actual_compartment != expected_compartment:
            raise SystemExit(
                f"Target bucket {physical} belongs to unexpected compartment."
            )
        checked_physical[physical] = {
            "compartment_id": actual_compartment,
            "public_access_type": bucket.get("public-access-type"),
            "storage_tier": bucket.get("storage-tier"),
        }

    uploaded: list[dict[str, Any]] = []
    objects = source.get("objects", [])

    for number, obj in enumerate(objects, start=1):
        logical_bucket = str(obj["bucket"])
        key = str(obj["key"])
        config = mapping[logical_bucket]
        target_bucket = str(config["bucket"])
        target_name = physical_name(config.get("prefix"), key)

        rel = obj.get("local_relpath")
        if not rel:
            raise SystemExit(f"Missing local_relpath for {logical_bucket}/{key}")
        local_file = export_dir / str(rel)
        if not local_file.is_file():
            raise SystemExit(f"Missing exported object file: {local_file}")

        actual_size = local_file.stat().st_size
        expected_size = int(obj.get("size_bytes") or 0)
        if actual_size != expected_size:
            raise SystemExit(
                f"Local byte size drift for {logical_bucket}/{key}: "
                f"manifest={expected_size}, file={actual_size}"
            )

        print(f"[{number}/{len(objects)}] {logical_bucket}/{key} -> {target_bucket}/{target_name}")
        run(
            [
                "oci", "--profile", args.oci_profile,
                "os", "object", "put",
                "--namespace-name", namespace,
                "--bucket-name", target_bucket,
                "--name", target_name,
                "--file", str(local_file),
                "--force",
            ]
        )

        uploaded.append(
            {
                "bucket": logical_bucket,
                "key": key,
                "size_bytes": expected_size,
                "content_sha256": obj.get("content_sha256"),
                "target_bucket": target_bucket,
                "target_object_name": target_name,
            }
        )

    payload = {
        "format_version": 1,
        "provider": "oci-object-storage-upload-record",
        "source_manifest_sha256": source.get("manifest_sha256"),
        "namespace": namespace,
        "target_compartment_id": expected_compartment,
        "bucket_map": mapping,
        "physical_bucket_checks": checked_physical,
        "objects": uploaded,
        "object_count": len(uploaded),
        "target_mutation_performed": True,
        "source_mutation_performed": False,
        "note": "SHA values are source expectations until target bytes are downloaded and re-hashed.",
    }

    out = Path(args.output_manifest)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Upload record: {out}")
    print("Run export-oci-storage-bytes.py before declaring byte parity.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
