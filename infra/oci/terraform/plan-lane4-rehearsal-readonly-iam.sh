#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN_PATH="${PLAN_PATH:-/tmp/teswa-lane4-rehearsal-readonly.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

COMPARTMENT="$($TF output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-core-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "lane4_readonly_iam_plan=FAIL reason=core_instance_not_found" >&2
  exit 2
}

rm -f "$PLAN_PATH"

"$TF" plan \
  -var='enable_lane4_rehearsal_readonly_iam=true' \
  -var="lane4_rehearsal_core_instance_ocid=$CORE_ID" \
  -target=oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly \
  -target=oci_identity_policy.teswa_core_lane4_rehearsal_readonly \
  -out="$PLAN_PATH"

"$TF" show -json "$PLAN_PATH" | python3 -c '
import json,sys
p=json.load(sys.stdin)
changes=p.get("resource_changes",[])
allowed={
  "oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0]",
  "oci_identity_policy.teswa_core_lane4_rehearsal_readonly[0]",
}
seen=set()
for r in changes:
    addr=r.get("address","")
    actions=(r.get("change") or {}).get("actions",[])
    if actions==["no-op"]:
        continue
    print(f"planned_resource={addr} actions={actions}")
    if addr not in allowed:
        raise SystemExit(f"lane4_readonly_iam_plan=FAIL reason=unexpected_resource address={addr}")
    if actions != ["create"]:
        raise SystemExit(f"lane4_readonly_iam_plan=FAIL reason=non_create_action address={addr} actions={actions}")
    seen.add(addr)
if seen != allowed:
    raise SystemExit(f"lane4_readonly_iam_plan=FAIL reason=unexpected_create_set seen={sorted(seen)}")
print("planned_add=2")
print("planned_change=0")
print("planned_destroy=0")
print("scope=teswa-core-01 -> teswa-backups/lane4-rehearsal/* read-only")
print("lane4_readonly_iam_plan=PASS")
'
