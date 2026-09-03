#!/usr/bin/env python3
"""
Compare two Teswa source cutover bundles and report drift between captures.

No network/database access. Useful for rehearsal -> final-cutover drift review.
It does not generate/apply a delta; Lane 4 currently prefers a fresh full data
refresh at final freeze because the live Teswa data set is small.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("older_bundle")
    p.add_argument("newer_bundle")
    p.add_argument("--output", required=True)
    return p.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def object_map(payload: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (str(row.get("bucket")), str(row.get("key"))): row
        for row in payload.get("objects", [])
    }


def main() -> int:
    args = parse_args()
    old_root = Path(args.older_bundle)
    new_root = Path(args.newer_bundle)

    old_pg = load_json(old_root / "source-baseline" / "source-manifest.json")
    new_pg = load_json(new_root / "source-baseline" / "source-manifest.json")
    old_identity = load_json(old_root / "identity-source.json")
    new_identity = load_json(new_root / "identity-source.json")
    old_storage = load_json(old_root / "storage-source.json")
    new_storage = load_json(new_root / "storage-source.json")

    old_tables = old_pg.get("data", {}).get("tables", {})
    new_tables = new_pg.get("data", {}).get("tables", {})

    changed_tables: list[dict[str, Any]] = []
    all_tables = sorted(set(old_tables) | set(new_tables))
    for table in all_tables:
        old = old_tables.get(table)
        new = new_tables.get(table)
        if old is None or new is None:
            changed_tables.append(
                {
                    "table": table,
                    "status": "added" if old is None else "removed",
                    "old": old,
                    "new": new,
                }
            )
            continue
        if (
            old.get("row_count") != new.get("row_count")
            or old.get("row_checksum_md5") != new.get("row_checksum_md5")
            or old.get("pk_set_checksum_md5") != new.get("pk_set_checksum_md5")
        ):
            changed_tables.append(
                {
                    "table": table,
                    "status": "changed",
                    "old_row_count": old.get("row_count"),
                    "new_row_count": new.get("row_count"),
                    "old_row_checksum_md5": old.get("row_checksum_md5"),
                    "new_row_checksum_md5": new.get("row_checksum_md5"),
                    "old_pk_set_checksum_md5": old.get("pk_set_checksum_md5"),
                    "new_pk_set_checksum_md5": new.get("pk_set_checksum_md5"),
                }
            )

    old_objects = object_map(old_storage)
    new_objects = object_map(new_storage)
    old_keys = set(old_objects)
    new_keys = set(new_objects)

    storage_added = sorted(new_keys - old_keys)
    storage_removed = sorted(old_keys - new_keys)
    storage_changed = []
    for key in sorted(old_keys & new_keys):
        old = old_objects[key]
        new = new_objects[key]
        if int(old.get("size_bytes") or 0) != int(new.get("size_bytes") or 0):
            storage_changed.append(
                {
                    "bucket": key[0],
                    "key": key[1],
                    "old_size_bytes": old.get("size_bytes"),
                    "new_size_bytes": new.get("size_bytes"),
                }
            )

    identity_changed = (
        old_identity.get("distinct_non_null_count") != new_identity.get("distinct_non_null_count")
        or old_identity.get("uuid_set_sha256") != new_identity.get("uuid_set_sha256")
    )

    schema_changed = old_pg.get("manifest_sha256") != new_pg.get("manifest_sha256")

    report = {
        "format_version": 1,
        "schema_or_data_manifest_changed": schema_changed,
        "changed_tables": changed_tables,
        "changed_table_count": len(changed_tables),
        "identity_changed": identity_changed,
        "identity": {
            "old_count": old_identity.get("distinct_non_null_count"),
            "new_count": new_identity.get("distinct_non_null_count"),
            "old_uuid_set_sha256": old_identity.get("uuid_set_sha256"),
            "new_uuid_set_sha256": new_identity.get("uuid_set_sha256"),
        },
        "storage": {
            "added": [{"bucket": b, "key": k} for b, k in storage_added],
            "removed": [{"bucket": b, "key": k} for b, k in storage_removed],
            "size_changed": storage_changed,
            "added_count": len(storage_added),
            "removed_count": len(storage_removed),
            "size_changed_count": len(storage_changed),
        },
        "rule": (
            "Drift is expected while Supabase remains authority. "
            "The production cutover uses a fresh final read-only bundle under a controlled write freeze; "
            "do not patch production source to force rehearsal parity."
        ),
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(
        {
            "changed_tables": len(changed_tables),
            "identity_changed": identity_changed,
            "storage_added": len(storage_added),
            "storage_removed": len(storage_removed),
            "storage_size_changed": len(storage_changed),
        },
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
