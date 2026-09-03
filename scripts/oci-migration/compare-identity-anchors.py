#!/usr/bin/env python3
"""Compare Teswa identity-anchor fingerprints without exposing UUIDs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("source")
    p.add_argument("target")
    p.add_argument("--report")
    args = p.parse_args()

    source = json.loads(Path(args.source).read_text(encoding="utf-8"))
    target = json.loads(Path(args.target).read_text(encoding="utf-8"))

    count_match = source.get("distinct_non_null_count") == target.get("distinct_non_null_count")
    hash_match = source.get("uuid_set_sha256") == target.get("uuid_set_sha256")
    passed = bool(count_match and hash_match)

    report = {
        "hard_gate_pass": passed,
        "source": {
            "label": source.get("label"),
            "relation": source.get("relation"),
            "count": source.get("distinct_non_null_count"),
            "uuid_set_sha256": source.get("uuid_set_sha256"),
        },
        "target": {
            "label": target.get("label"),
            "relation": target.get("relation"),
            "count": target.get("distinct_non_null_count"),
            "uuid_set_sha256": target.get("uuid_set_sha256"),
        },
        "count_match": count_match,
        "uuid_set_match": hash_match,
        "rule": "Existing Teswa identity UUIDs must be preserved exactly across provider ownership changes.",
    }

    print(json.dumps(report, indent=2))
    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
