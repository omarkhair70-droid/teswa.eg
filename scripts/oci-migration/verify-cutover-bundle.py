#!/usr/bin/env python3
"""
Verify SHA-256 integrity of a Teswa cutover evidence bundle.

No network/database access. The bundle manifest itself is not self-hashed; every
other captured file must match its recorded byte length and SHA-256.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("bundle_dir")
    p.add_argument("--report")
    args = p.parse_args()

    root = Path(args.bundle_dir)
    manifest_path = root / "bundle-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    failures = []
    verified = []

    for row in manifest.get("files", []):
        rel = str(row["path"])
        path = root / rel
        if not path.is_file():
            failures.append({"path": rel, "reason": "missing"})
            continue

        actual_bytes = path.stat().st_size
        expected_bytes = int(row.get("bytes") or 0)
        if actual_bytes != expected_bytes:
            failures.append({
                "path": rel,
                "reason": "size_mismatch",
                "expected": expected_bytes,
                "actual": actual_bytes,
            })
            continue

        actual_sha = file_sha256(path)
        expected_sha = str(row.get("sha256") or "")
        if actual_sha != expected_sha:
            failures.append({
                "path": rel,
                "reason": "sha256_mismatch",
                "expected": expected_sha,
                "actual": actual_sha,
            })
            continue

        verified.append(rel)

    known = {str(row["path"]) for row in manifest.get("files", [])}
    unexpected = sorted(
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file()
        and p.relative_to(root).as_posix() != "bundle-manifest.json"
        and p.relative_to(root).as_posix() not in known
    )

    report = {
        "format_version": 1,
        "bundle_dir": str(root),
        "hard_gate_pass": not failures,
        "verified_files": len(verified),
        "failures": failures,
        "unexpected_files": unexpected,
        "note": (
            "Unexpected files are reported but are not a hard failure because "
            "operators may add separate notes/evidence after capture."
        ),
    }

    print(json.dumps(report, indent=2))
    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
