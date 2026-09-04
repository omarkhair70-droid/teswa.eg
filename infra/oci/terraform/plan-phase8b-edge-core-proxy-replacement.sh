#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE8B_EDGE_PROXY_PLAN:-/tmp/teswa-phase8b-edge-core-proxy.plan}"
JSON="${TESWA_PHASE8B_EDGE_PROXY_JSON:-/tmp/teswa-phase8b-edge-core-proxy.json}"
STATE_JSON="${TESWA_PHASE8B_EDGE_PROXY_STATE:-/tmp/teswa-phase8b-edge-core-proxy-state.json}"

[ -x "$TF" ] || { echo "phase8b_edge_proxy_plan=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8b_edge_proxy_plan=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8b_edge_proxy_plan=FAIL reason=python_missing" >&2; exit 1; }
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
CORE_EXPECTED_IP="$("$TF" output -raw teswa_core_private_ip)"

EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_IP="$(oci compute instance list-vnics --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output)"
CORE_IP="$(oci compute instance list-vnics --instance-id "$CORE_ID" --query 'data[0]."private-ip"' --raw-output)"

for pair in "tenancy:$TENANCY" "edge_id:$EDGE_ID" "core_id:$CORE_ID" "edge_ip:$EDGE_IP" "core_ip:$CORE_IP"; do
  label="${pair%%:*}"; value="${pair#*:}"
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || {
    echo "phase8b_edge_proxy_plan=FAIL reason=missing_runtime_value target=$label" >&2
    exit 2
  }
done
[ "$CORE_IP" = "$CORE_EXPECTED_IP" ] || {
  echo "phase8b_edge_proxy_plan=FAIL reason=core_private_ip_drift expected=$CORE_EXPECTED_IP actual=$CORE_IP" >&2
  exit 3
}

"$TF" state pull > "$STATE_JSON"
IMAGES="$(python3 - "$STATE_JSON" <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
def image(name,display,shape):
    vals=[]
    for r in p.get("resources",[]):
        if r.get("type")!="oci_core_instance" or r.get("name")!=name: continue
        for i in r.get("instances",[]):
            a=i.get("attributes") or {}
            if a.get("display_name")!=display or a.get("shape")!=shape: continue
            sd=a.get("source_details") or []
            v=(sd[0] if sd else {}).get("source_id")
            if v: vals.append(v)
    if len(vals)!=1: raise SystemExit(f"image lookup failed for {display}: {len(vals)}")
    return vals[0]
print(image("edge","teswa-edge-01","VM.Standard.E2.1.Micro")+"|"+image("core","teswa-core-01","VM.Standard.A1.Flex"))
PY
)"
EDGE_IMAGE="${IMAGES%%|*}"
CORE_IMAGE="${IMAGES#*|}"

rm -f "$PLAN" "$JSON"
echo "TESWA PHASE 8B EDGE TO CORE PROXY REPLACEMENT PLAN"
echo "mode=plan-only"
echo "replacement_scope=edge_only"
echo "edge_private_ip_preserved=$EDGE_IP"
echo "core_upstream=$CORE_IP"
echo "listener=$EDGE_IP:8080"
echo "public_80_443=false"
echo "dns_change=none_expected"
echo "production_cutover=none_expected"

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan \
  -var="tenancy_ocid=$TENANCY" \
  -var="enable_compute_phase3=true" \
  -var="edge_image_ocid=$EDGE_IMAGE" \
  -var="core_image_ocid=$CORE_IMAGE" \
  -var="enable_phase8b_internal_proxy=true" \
  -var="phase8b_core_private_ip=$CORE_IP" \
  -var="phase8b_edge_private_ip=$EDGE_IP" \
  -replace='oci_core_instance.edge[0]' \
  -target='oci_core_instance.edge[0]' \
  -out="$PLAN"

"$TF" show -json "$PLAN" > "$JSON"
python3 - "$JSON" "$EDGE_IP" "$CORE_IP" <<'PY'
import base64,json,sys
p=json.load(open(sys.argv[1],encoding="utf-8")); edge_ip=sys.argv[2]; core_ip=sys.argv[3]
changes=[]
for rc in p.get("resource_changes",[]):
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"],["read"]): continue
    changes.append((rc.get("address",""),actions,rc.get("change",{}).get("after") or {}))
for a,actions,_ in changes: print(f"planned_resource={a} actions={actions}")
if len(changes)!=1 or changes[0][0]!="oci_core_instance.edge[0]" or set(changes[0][1])!={"create","delete"}:
    print("phase8b_edge_proxy_plan_guard=FAIL reason=unexpected_changes")
    raise SystemExit(10)
actions,after=changes[0][1],changes[0][2]
vnic=(after.get("create_vnic_details") or [{}])[0]
if vnic.get("private_ip")!=edge_ip:
    print(f"phase8b_edge_proxy_plan_guard=FAIL reason=edge_private_ip_not_pinned actual={vnic.get('private_ip')}")
    raise SystemExit(11)
metadata=after.get("metadata") or {}
if set(metadata)!={"user_data"}:
    print(f"phase8b_edge_proxy_plan_guard=FAIL reason=unexpected_metadata keys={sorted(metadata)}")
    raise SystemExit(12)
payload=base64.b64decode(metadata["user_data"]).decode("utf-8")
required=[
    f"http://{core_ip}:3100",
    f"http://{core_ip}:3200",
    "handle /internal/api-health",
    "handle /internal/realtime-health",
    "phase8b_proxy=true",
    "http://${EDGE_PRIVATE_IP}:8080",
    "/internal/api-health",
    "/internal/realtime-health",
]
missing=[x for x in required if x not in payload]
if missing:
    print(f"phase8b_edge_proxy_plan_guard=FAIL reason=bootstrap_missing missing={missing}")
    raise SystemExit(13)
for forbidden in ("ssh_authorized_keys","http://0.0.0.0:8080",":80 {",":443 {","firewall-cmd --add-port=8080"):
    if forbidden in payload:
        print(f"phase8b_edge_proxy_plan_guard=FAIL reason=forbidden_marker marker={forbidden}")
        raise SystemExit(14)
print("planned_replacements=1")
print("planned_other_changes=0")
print(f"edge_private_ip_preserved={edge_ip}")
print(f"core_api_upstream={core_ip}:3100")
print(f"core_realtime_upstream={core_ip}:3200")
print("public_80_443=false")
print("dns_change=none")
print("production_cutover=none")
print("phase8b_edge_proxy_plan_guard=PASS")
PY

echo "saved_plan=$PLAN"
echo "No OCI resources were changed."
echo "Apply only this exact saved plan after PASS."
