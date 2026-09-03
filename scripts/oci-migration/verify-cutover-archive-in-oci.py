#!/usr/bin/env python3
"""
Verify a Teswa cutover archive stored in OCI teswa-backups by downloading every
recorded object and checking byte length + SHA-256.

OCI target read-only. No source access or mutation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("archive_record")
    p.add_argument("--output-dir", required=True)
    p.add_argument("--report", required=True)
    p.add_argument("--oci-profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    return p.parse_args()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(args: list[str]) -> None:
    proc = subprocess.run(args)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {proc.returncode}")


def main() -> int:
    args = parse_args()
    record = json.loads(Path(args.archive_record).read_text(encoding="utf-8"))
    namespace = str(record["namespace"])
    bucket = str(record["bucket_name"])

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    failures = 0

    for number, obj in enumerate(record.get("objects", []), start=1):
        object_name = str(obj["object_name"])
        local = out_dir / hashlib.sha256(object_name.encode("utf-8")).hexdigest()
        local.unlink(missing_ok=True)

        print(f"[{number}/{len(record.get('objects', []))}] GET {bucket}/{object_name}")
        run(
            [
                "oci", "--profile", args.oci_profile,
                "os", "object", "get",
                "--namespace-name", namespace,
                "--bucket-name", bucket,
                "--name", object_name,
                "--file", str(local),
            ]
        )

        actual_bytes = local.stat().st_size
        actual_sha = sha256(local)
        bytes_ok = actual_bytes == int(obj["bytes"])
        sha_ok = actual_sha == str(obj["sha256"])
        passed = bytes_ok and sha_ok
        if not passed:
            failures += 1

        results.append(
            {
                "object_name": object_name,
                "pass": passed,
                "expected_bytes": int(obj["bytes"]),
                "actual_bytes": actual_bytes,
                "expected_sha256": str(obj["sha256"]),
                "actual_sha256": actual_sha,
            }
        )

    report = {
        "format_version": 1,
        "hard_gate_pass": failures == 0,
        "bucket": bucket,
        "objects_checked": len(results),
        "failures": failures,
        "results": results,
        "target_mutations": False,
    }

    out = Path(args.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "hard_gate_pass": report["hard_gate_pass"],
        "objects_checked": len(results),
        "failures": failures,
        "report": str(out),
    }, indent=2))
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
