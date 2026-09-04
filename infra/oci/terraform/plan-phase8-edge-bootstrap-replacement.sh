#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE8_EDGE_PLAN:-/tmp/teswa-phase8-edge-bootstrap-replacement.plan}"
JSON="${TESWA_PHASE8_EDGE_PLAN_JSON:-/tmp/teswa-phase8-edge-bootstrap-replacement.json}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
[ -n "$COMPARTMENT" ] || { echo "phase8_edge_plan=FAIL reason=missing_compartment" >&2; exit 2; }

TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"

for pair in "TENANCY:$TENANCY" "EDGE_ID:$EDGE_ID" "CORE_ID:$CORE_ID"; do
  k="${pair%%:*}"; v="${pair#*:}"
  [ -n "$v" ] && [ "$v" != "null" ] && [ "$v" != "None" ] || { echo "phase8_edge_plan=FAIL reason=missing_$k" >&2; exit 3; }
done

EDGE_IMAGE="$(oci compute instance get --instance-id "$EDGE_ID" --query 'data.image' --raw-output)"
CORE_IMAGE="$(oci compute instance get --instance-id "$CORE_ID" --query 'data.image' --raw-output)"

[ -n "$EDGE_IMAGE" ] && [ "$EDGE_IMAGE" != "null" ] || { echo "phase8_edge_plan=FAIL reason=missing_edge_image" >&2; exit 4; }
[ -n "$CORE_IMAGE" ] && [ "$CORE_IMAGE" != "null" ] || { echo "phase8_edge_plan=FAIL reason=missing_core_image" >&2; exit 4; }

rm -f "$PLAN" "$JSON"

echo "TESWA PHASE 8 EDGE BOOTSTRAP REPLACEMENT PLAN"
echo "mode=plan-only"
echo "target=teswa-edge-01"
echo "replacement_scope=edge_only"
echo "public_ssh_rule_change=none_expected"
echo "core_change=none_expected"
echo "network_change=none_expected"
echo "storage_change=none_expected"

"$TF" fmt -check *.tf
"$TF" validate

"$TF" plan \
  -var="tenancy_ocid=$TENANCY" \
  -var="enable_compute_phase3=true" \
  -var="edge_image_ocid=$EDGE_IMAGE" \
  -var="core_image_ocid=$CORE_IMAGE" \
  -replace='oci_core_instance.edge[0]' \
  -target='oci_core_instance.edge[0]' \
  -out="$PLAN"

"$TF" show -json "$PLAN" > "$JSON"

python3 - "$JSON" <<'PY'
import base64,json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
changes=[]
for rc in p.get("resource_changes",[]):
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"],["read"]):
        continue
    changes.append((rc.get("address",""), actions, rc.get("change",{}).get("after") or {}))

print("PHASE8 EDGE REPLACEMENT PLAN GUARD")
for addr,actions,_ in changes:
    print(f"planned_resource={addr} actions={actions}")

if len(changes) != 1:
    print(f"phase8_edge_plan_guard=FAIL reason=unexpected_change_count count={len(changes)}")
    raise SystemExit(10)
addr,actions,after=changes[0]
if addr != "oci_core_instance.edge[0]" or set(actions) != {"create","delete"}:
    print(f"phase8_edge_plan_guard=FAIL reason=unexpected_actions address={addr} actions={actions}")
    raise SystemExit(11)

metadata=after.get("metadata") or {}
if set(metadata) != {"user_data"}:
    print(f"phase8_edge_plan_guard=FAIL reason=unexpected_metadata_keys keys={sorted(metadata)}")
    raise SystemExit(12)
encoded=metadata.get("user_data") or ""
try:
    payload=base64.b64decode(encoded).decode("utf-8")
except Exception:
    print("phase8_edge_plan_guard=FAIL reason=user_data_decode")
    raise SystemExit(13)
required="ocarun ALL=(ALL) NOPASSWD:ALL"
if required not in payload or "visudo" not in payload:
    print("phase8_edge_plan_guard=FAIL reason=sudo_bootstrap_missing")
    raise SystemExit(14)

vnic=after.get("create_vnic_details") or []
if not vnic or str(vnic[0].get("assign_public_ip")).lower() != "true":
    print("phase8_edge_plan_guard=FAIL reason=edge_public_vnic_changed")
    raise SystemExit(15)

print("planned_replacements=1")
print("planned_other_changes=0")
print("sudo_bootstrap_present=true")
print("ssh_authorized_keys_present=false")
print("phase8_edge_plan_guard=PASS")
PY

echo "saved_plan=$PLAN"
echo "No OCI resources were changed."
echo "Do not apply until this exact saved plan is reviewed."
