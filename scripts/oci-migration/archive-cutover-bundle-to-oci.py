#!/usr/bin/env python3
"""
Archive a verified Teswa cutover evidence bundle into the pre-created,
private/versioned OCI teswa-backups bucket.

Target-mutating safety gates:
- TESWA_ALLOW_TARGET_WRITE=YES
- TESWA_OCI_BACKUP_ASSERTION=YES
- TESWA_OCI_COMPARTMENT_OCID exact match
- bucket must be NoPublicAccess
- bucket versioning must be Enabled

No Supabase/source mutation is performed.
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
from typing import Any


SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("bundle_dir")
    p.add_argument("--bucket-name", default="teswa-backups")
    p.add_argument("--prefix", default="migration-cutovers")
    p.add_argument("--output-record", required=True)
    p.add_argument("--oci-profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    return p.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_json(args: list[str]) -> dict[str, Any]:
    proc = subprocess.run(args, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Command failed: {' '.join(args)}")
    return json.loads(proc.stdout or "{}")


def run(args: list[str]) -> None:
    proc = subprocess.run(args)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {proc.returncode}")


def safe_segment(value: str) -> str:
    cleaned = SAFE_SEGMENT.sub("-", value).strip("-")
    return cleaned or "capture"


def main() -> int:
    args = parse_args()

    if os.environ.get("TESWA_ALLOW_TARGET_WRITE") != "YES":
        print("Refusing target write. Set TESWA_ALLOW_TARGET_WRITE=YES.", file=sys.stderr)
        return 2
    if os.environ.get("TESWA_OCI_BACKUP_ASSERTION") != "YES":
        print("Refusing backup upload. Set TESWA_OCI_BACKUP_ASSERTION=YES.", file=sys.stderr)
        return 2

    expected_compartment = os.environ.get("TESWA_OCI_COMPARTMENT_OCID", "").strip()
    if not expected_compartment:
        print("Set TESWA_OCI_COMPARTMENT_OCID.", file=sys.stderr)
        return 2

    root = Path(args.bundle_dir)
    bundle_manifest_path = root / "bundle-manifest.json"
    if not bundle_manifest_path.is_file():
        raise SystemExit("bundle-manifest.json is missing.")

    bundle = json.loads(bundle_manifest_path.read_text(encoding="utf-8"))

    # Re-verify the captured evidence before uploading it.
    for row in bundle.get("files", []):
        rel = str(row["path"])
        path = root / rel
        if not path.is_file():
            raise SystemExit(f"Bundle file missing: {rel}")
        if path.stat().st_size != int(row.get("bytes") or 0):
            raise SystemExit(f"Bundle size mismatch: {rel}")
        if file_sha256(path) != str(row.get("sha256") or ""):
            raise SystemExit(f"Bundle SHA-256 mismatch: {rel}")

    namespace_payload = run_json(
        ["oci", "--profile", args.oci_profile, "os", "ns", "get", "--output", "json"]
    )
    namespace = namespace_payload.get("data")
    if not isinstance(namespace, str) or not namespace:
        raise SystemExit("Could not resolve OCI Object Storage namespace.")

    bucket_payload = run_json(
        [
            "oci", "--profile", args.oci_profile,
            "os", "bucket", "get",
            "--namespace-name", namespace,
            "--bucket-name", args.bucket_name,
            "--output", "json",
        ]
    )
    bucket = bucket_payload.get("data") or {}
    if bucket.get("compartment-id") != expected_compartment:
        raise SystemExit("teswa-backups bucket belongs to an unexpected compartment.")
    if bucket.get("public-access-type") != "NoPublicAccess":
        raise SystemExit("teswa-backups must be private (NoPublicAccess).")
    if bucket.get("versioning") != "Enabled":
        raise SystemExit("teswa-backups must have Object Versioning enabled.")

    capture_id = safe_segment(str(bundle.get("captured_utc") or "capture"))
    prefix = args.prefix.strip("/")
    object_root = f"{prefix}/{capture_id}"

    files_to_upload = [
        (str(row["path"]), root / str(row["path"]))
        for row in bundle.get("files", [])
    ]
    files_to_upload.append(("bundle-manifest.json", bundle_manifest_path))

    uploaded = []
    for number, (rel, path) in enumerate(files_to_upload, start=1):
        object_name = f"{object_root}/{rel}"
        print(f"[{number}/{len(files_to_upload)}] {rel} -> {args.bucket_name}/{object_name}")
        run(
            [
                "oci", "--profile", args.oci_profile,
                "os", "object", "put",
                "--namespace-name", namespace,
                "--bucket-name", args.bucket_name,
                "--name", object_name,
                "--file", str(path),
                "--force",
                "--verify-checksum",
            ]
        )
        uploaded.append(
            {
                "local_path": rel,
                "object_name": object_name,
                "bytes": path.stat().st_size,
                "sha256": file_sha256(path),
            }
        )

    record = {
        "format_version": 1,
        "namespace": namespace,
        "bucket_name": args.bucket_name,
        "object_root": object_root,
        "bundle_captured_utc": bundle.get("captured_utc"),
        "files_uploaded": len(uploaded),
        "objects": uploaded,
        "source_mutation_performed": False,
        "target_mutation_performed": True,
        "bucket_public_access_type": bucket.get("public-access-type"),
        "bucket_versioning": bucket.get("versioning"),
    }

    out = Path(args.output_record)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Backup archive record: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
