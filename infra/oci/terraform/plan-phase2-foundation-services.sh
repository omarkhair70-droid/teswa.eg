#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE2_PLAN:-teswa-phase2-foundation-services.plan}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

echo "TESWA OCI PHASE 2 FOUNDATION SERVICES PLAN"
echo "mode=plan-only"
echo

"$TF" fmt -check *.tf
"$TF" validate

"$TF" plan   -out="$PLAN"   -var='enable_object_storage=true'   -var='enable_vault=true'   -var='enable_notifications=true'

"$TF" show -json "$PLAN" >/tmp/teswa-phase2-plan.json

python3 - /tmp/teswa-phase2-plan.json <<'PY'
import json, sys

plan = json.load(open(sys.argv[1], encoding="utf-8"))
changes = plan.get("resource_changes", [])

adds = []
changes_existing = []
destroys = []
for rc in changes:
    actions = rc.get("change", {}).get("actions", [])
    addr = rc.get("address", "")
    if actions == ["create"]:
        adds.append(addr)
    elif actions == ["no-op"] or actions == ["read"]:
        continue
    else:
        changes_existing.append((addr, actions))
    if "delete" in actions:
        destroys.append(addr)

allowed = {
    "oci_objectstorage_bucket.media[0]",
    "oci_objectstorage_bucket.backups[0]",
    "oci_kms_vault.teswa[0]",
    "oci_ons_notification_topic.teswa_ops[0]",
}

print()
print("PHASE2 PLAN GUARD")
print(f"adds={len(adds)}")
print(f"changes_existing={len(changes_existing)}")
print(f"destroys={len(destroys)}")
for addr in adds:
    print(f"add={addr}")

unexpected = set(adds) - allowed
missing = allowed - set(adds)

if changes_existing or destroys or unexpected or missing or len(adds) != 4:
    print("phase2_plan_guard=FAIL")
    if changes_existing:
        print(f"unexpected_changes={changes_existing}")
    if destroys:
        print(f"unexpected_destroys={destroys}")
    if unexpected:
        print(f"unexpected_adds={sorted(unexpected)}")
    if missing:
        print(f"missing_expected_adds={sorted(missing)}")
    raise SystemExit(2)

print("phase2_plan_guard=PASS")
print()
print("Saved plan:")
print(sys.argv[1].replace("/tmp/teswa-phase2-plan.json", "teswa-phase2-foundation-services.plan"))
PY

echo
echo "No OCI resources were changed."
echo "Do not apply until this saved plan is reviewed."
