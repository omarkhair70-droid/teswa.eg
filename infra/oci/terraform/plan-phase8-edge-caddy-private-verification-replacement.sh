#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE8_PRIVATE_VERIFY_PLAN:-/tmp/teswa-phase8-edge-caddy-private-verify.plan}"
JSON="${TESWA_PHASE8_PRIVATE_VERIFY_PLAN_JSON:-/tmp/teswa-phase8-edge-caddy-private-verify.json}"
STATE_JSON="${TESWA_PHASE8_PRIVATE_VERIFY_STATE_JSON:-/tmp/teswa-phase8-edge-caddy-private-verify-state.json}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "oci cli missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 missing" >&2; exit 1; }
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
[ -n "$TENANCY" ] && [ "$TENANCY" != "null" ] && [ "$TENANCY" != "None" ] || {
  echo "phase8_private_verify_plan=FAIL reason=missing_tenancy" >&2
  exit 2
}

"$TF" state pull > "$STATE_JSON"
IMAGES="$(python3 - "$STATE_JSON" <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))

def image_for(name, display, shape):
    out=[]
    for r in p.get("resources",[]):
        if r.get("type") != "oci_core_instance" or r.get("name") != name:
            continue
        for inst in r.get("instances",[]):
            a=inst.get("attributes") or {}
            if a.get("display_name") != display or a.get("shape") != shape:
                continue
            sd=a.get("source_details") or []
            value=(sd[0] if sd else {}).get("source_id")
            if value: out.append(value)
    if len(out) != 1:
        raise SystemExit(f"image lookup failed for {display}: {len(out)}")
    return out[0]

print(image_for("edge","teswa-edge-01","VM.Standard.E2.1.Micro")+"|"+image_for("core","teswa-core-01","VM.Standard.A1.Flex"))
PY
)"
EDGE_IMAGE="${IMAGES%%|*}"
CORE_IMAGE="${IMAGES#*|}"

rm -f "$PLAN" "$JSON"

echo "TESWA PHASE 8 EDGE CADDY PRIVATE VERIFICATION REPLACEMENT PLAN"
echo "mode=plan-only"
echo "replacement_scope=edge_only"
echo "new_network_rule=app_nsg_to_edge_8080_only"
echo "public_8080=forbidden"
echo "edge_run_command_dependency=none"
echo "console_history_dependency=none"
echo "dns_change=none_expected"
echo "production_cutover=none_expected"

"$TF" fmt -check *.tf
"$TF" validate

"$TF" plan \
  -var="tenancy_ocid=$TENANCY" \
  -var="enable_compute_phase3=true" \
  -var="edge_image_ocid=$EDGE_IMAGE" \
  -var="core_image_ocid=$CORE_IMAGE" \
  -replace='oci_core_instance.edge[0]' \
  -target='oci_core_instance.edge[0]' \
  -target='oci_core_network_security_group_security_rule.edge_caddy_verify_from_app[0]' \
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
    changes.append((rc.get("address",""),actions,rc.get("change",{}).get("after") or {}))

for addr,actions,_ in changes:
    print(f"planned_resource={addr} actions={actions}")

expected={
    "oci_core_instance.edge[0]",
    "oci_core_network_security_group_security_rule.edge_caddy_verify_from_app[0]",
}
actual={x[0] for x in changes}
if actual != expected or len(changes) != 2:
    print(f"phase8_private_verify_plan_guard=FAIL reason=unexpected_changes actual={sorted(actual)}")
    raise SystemExit(10)

by={addr:(actions,after) for addr,actions,after in changes}
actions,edge=by["oci_core_instance.edge[0]"]
if set(actions) != {"create","delete"}:
    print(f"phase8_private_verify_plan_guard=FAIL reason=edge_not_replacement actions={actions}")
    raise SystemExit(11)

metadata=edge.get("metadata") or {}
if set(metadata) != {"user_data"}:
    print(f"phase8_private_verify_plan_guard=FAIL reason=unexpected_edge_metadata keys={sorted(metadata)}")
    raise SystemExit(12)
payload=base64.b64decode(metadata["user_data"]).decode("utf-8")
required=[
    'CADDY_VERSION="2.11.4"',
    'sha512sum -c caddy_asset_checksum.txt',
    'EDGE_PRIVATE_IP=',
    'http://${EDGE_PRIVATE_IP}:8080',
    'source address="10.20.10.0/24" port port="8080"',
    '/var/lib/teswa/phase8-caddy-boot-pass',
    'public_listener=false',
]
missing=[x for x in required if x not in payload]
if missing:
    print(f"phase8_private_verify_plan_guard=FAIL reason=edge_bootstrap_missing missing={missing}")
    raise SystemExit(13)
for forbidden in (
    'ssh_authorized_keys',
    'http://0.0.0.0:8080',
    'firewall-cmd --add-port=8080',
    'firewall-cmd --add-service',
):
    if forbidden in payload:
        print(f"phase8_private_verify_plan_guard=FAIL reason=forbidden_edge_bootstrap marker={forbidden}")
        raise SystemExit(14)

rule_actions,rule=by["oci_core_network_security_group_security_rule.edge_caddy_verify_from_app[0]"]
if rule_actions != ["create"]:
    print(f"phase8_private_verify_plan_guard=FAIL reason=verify_rule_not_create actions={rule_actions}")
    raise SystemExit(15)
if rule.get("direction") != "INGRESS" or rule.get("protocol") != "6" or rule.get("source_type") != "NETWORK_SECURITY_GROUP":
    print("phase8_private_verify_plan_guard=FAIL reason=verify_rule_shape")
    raise SystemExit(16)
tcp=rule.get("tcp_options") or []
rng=((tcp[0] if tcp else {}).get("destination_port_range") or [])
rng=(rng[0] if rng else {})
if rng.get("min") != 8080 or rng.get("max") != 8080:
    print(f"phase8_private_verify_plan_guard=FAIL reason=verify_rule_port range={rng}")
    raise SystemExit(17)

print("planned_replacements=1")
print("planned_network_rule_creates=1")
print("planned_other_changes=0")
print("listen_scope=edge_private_ip_only")
print("verify_source=app_nsg_only")
print("verify_port=8080")
print("public_8080=false")
print("edge_run_command_dependency=none")
print("console_history_dependency=none")
print("phase8_private_verify_plan_guard=PASS")
PY

echo "saved_plan=$PLAN"
echo "No OCI resources were changed."
echo "Apply only this exact saved plan after PASS."
