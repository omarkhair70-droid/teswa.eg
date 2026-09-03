#!/usr/bin/env python3
"""
Evaluate Teswa Supabase -> OCI rehearsal/production cutover readiness.

This script performs no network or database operations. It aggregates evidence
reports produced by Lane 4 plus explicit semantic gates that cannot safely be
reduced to schema checks.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


COMMON_SEMANTIC_GATES = (
    "lane2_provider_boundary_ready",
    "oci_postgres_ready",
    "auth_semantics_verified",
    "rpc_authorization_verified",
    "media_access_verified",
    "realtime_verified",
    "worker_notification_verified",
    "rollback_drill_verified",
)

PRODUCTION_ONLY_GATES = (
    "source_write_freeze_active",
    "final_source_bundle_captured",
    "routing_switch_plan_approved",
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=("rehearsal", "production"), required=True)
    p.add_argument("--postgres-report", required=True)
    p.add_argument("--fk-report", required=True)
    p.add_argument("--identity-report", required=True)
    p.add_argument("--storage-report", required=True)
    p.add_argument("--semantic-gates", required=True)
    p.add_argument("--output", required=True)
    return p.parse_args()


def load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hard_pass(payload: dict[str, Any]) -> bool:
    if "hard_gate_pass" in payload:
        return payload.get("hard_gate_pass") is True
    return payload.get("result", {}).get("hard_gate_pass") is True


def main() -> int:
    args = parse_args()

    evidence = {
        "postgres_parity": load(args.postgres_report),
        "fk_orphans": load(args.fk_report),
        "identity_continuity": load(args.identity_report),
        "storage_byte_parity": load(args.storage_report),
    }
    evidence_status = {name: hard_pass(payload) for name, payload in evidence.items()}

    semantics = load(args.semantic_gates)
    required = list(COMMON_SEMANTIC_GATES)
    if args.mode == "production":
        required.extend(PRODUCTION_ONLY_GATES)

    semantic_status = {
        key: semantics.get(key) is True
        for key in required
    }
    unknown = sorted(
        key for key in semantics
        if key not in set(COMMON_SEMANTIC_GATES) | set(PRODUCTION_ONLY_GATES) | {"notes"}
    )

    blockers = [
        f"evidence:{name}" for name, passed in evidence_status.items() if not passed
    ] + [
        f"semantic:{name}" for name, passed in semantic_status.items() if not passed
    ]

    report = {
        "format_version": 1,
        "mode": args.mode,
        "cutover_ready": not blockers,
        "evidence_gates": evidence_status,
        "semantic_gates": semantic_status,
        "blockers": blockers,
        "unknown_semantic_keys": unknown,
        "notes": semantics.get("notes"),
        "rule": (
            "No production provider switch while any hard or semantic gate is false. "
            "A green schema/data comparison alone is not production cutover approval."
        ),
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["cutover_ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
