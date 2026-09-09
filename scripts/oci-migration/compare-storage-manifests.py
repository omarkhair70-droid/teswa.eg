#!/usr/bin/env python3
"""
Compare normalized Teswa storage manifests.

Hard gates:
- same logical bucket/key object set
- same byte size for every object

Optional hard gate:
- --require-content-sha256 requires a SHA-256 on both sides and exact equality

Provider-specific ETags, bucket ACL/public flags, timestamps, and generated URLs
are not treated as byte-parity proof. Access behavior is verified separately
through the Teswa media contract.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--report")
    parser.add_argument("--require-content-sha256", action="store_true")
    return parser.parse_args()


def load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def object_map(payload: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    duplicates: list[tuple[str, str]] = []
    for row in payload.get("objects", []):
        key = (str(row.get("bucket")), str(row.get("key")))
        if key in result:
            duplicates.append(key)
        result[key] = row
    if duplicates:
        rendered = ", ".join(f"{b}/{k}" for b, k in duplicates[:10])
        raise ValueError(f"Duplicate storage keys in manifest: {rendered}")
    return result


def main() -> int:
    args = parse_args()
    source = load(args.source)
    target = load(args.target)
    src = object_map(source)
    dst = object_map(target)

    src_keys = set(src)
    dst_keys = set(dst)
    missing = sorted(src_keys - dst_keys)
    extra = sorted(dst_keys - src_keys)

    size_mismatch: list[dict[str, Any]] = []
    sha_mismatch: list[dict[str, Any]] = []
    sha_missing: list[dict[str, str]] = []

    for key in sorted(src_keys & dst_keys):
        s = src[key]
        t = dst[key]

        if int(s.get("size_bytes") or 0) != int(t.get("size_bytes") or 0):
            size_mismatch.append(
                {
                    "bucket": key[0],
                    "key": key[1],
                    "source": s.get("size_bytes"),
                    "target": t.get("size_bytes"),
                }
            )

        s_sha = s.get("content_sha256")
        t_sha = t.get("content_sha256")
        if args.require_content_sha256:
            if not s_sha or not t_sha:
                sha_missing.append({"bucket": key[0], "key": key[1]})
            elif s_sha != t_sha:
                sha_mismatch.append(
                    {
                        "bucket": key[0],
                        "key": key[1],
                        "source": s_sha,
                        "target": t_sha,
                    }
                )
        elif s_sha and t_sha and s_sha != t_sha:
            sha_mismatch.append(
                {
                    "bucket": key[0],
                    "key": key[1],
                    "source": s_sha,
                    "target": t_sha,
                }
            )

    passed = not (missing or extra or size_mismatch or sha_mismatch or sha_missing)

    report = {
        "source_provider": source.get("provider"),
        "target_provider": target.get("provider"),
        "source_manifest_sha256": source.get("manifest_sha256"),
        "target_manifest_sha256": target.get("manifest_sha256"),
        "source_object_count": len(src),
        "target_object_count": len(dst),
        "missing_in_target": [
            {"bucket": bucket, "key": key} for bucket, key in missing
        ],
        "extra_in_target": [
            {"bucket": bucket, "key": key} for bucket, key in extra
        ],
        "size_mismatch": size_mismatch,
        "content_sha256_mismatch": sha_mismatch,
        "content_sha256_missing": sha_missing,
        "require_content_sha256": bool(args.require_content_sha256),
        "hard_gate_pass": passed,
        "notes": [
            "Provider ETags are not compared as content hashes.",
            "Bucket public/private implementation is not a byte-parity gate.",
            "Signed/public/private access semantics must be verified through the Teswa media boundary.",
        ],
    }

    print(
        json.dumps(
            {
                "hard_gate_pass": passed,
                "source_objects": len(src),
                "target_objects": len(dst),
                "missing": len(missing),
                "extra": len(extra),
                "size_mismatch": len(size_mismatch),
                "sha_mismatch": len(sha_mismatch),
                "sha_missing": len(sha_missing),
            },
            indent=2,
        )
    )

    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Report: {out}")

    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
