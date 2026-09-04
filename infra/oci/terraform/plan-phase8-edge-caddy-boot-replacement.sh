#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE8_CADDY_BOOT_PLAN:-/tmp/teswa-phase8-edge-caddy-boot-replacement.plan}"
JSON="${TESWA_PHASE8_CADDY_BOOT_PLAN_JSON:-/tmp/teswa-phase8-edge-caddy-boot-replacement.json}"
STATE_JSON="${TESWA_PHASE8_CADDY_BOOT_STATE_JSON:-/tmp/teswa-phase8-edge-caddy-boot-state.json}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
[ -n "$COMPARTMENT" ] || { echo "phase8_caddy_boot_plan=FAIL reason=missing_compartment" >&2; exit 2; }
TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
[ -n "$TENANCY" ] && [ "$TENANCY" != "null" ] && [ "$TENANCY" != "None" ] || {
  echo "phase8_caddy_boot_plan=FAIL reason=missing_tenancy" >&2
  exit 3
}

"$TF" state pull > "$STATE_JSON"
IMAGES="$(python3 - "$STATE_JSON" <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))

def image_for(name, expected_display, expected_shape):
    matches=[]
    for r in p.get("resources",[]):
        if r.get("type") != "oci_core_instance" or r.get("name") != name:
            continue
        for inst in r.get("instances",[]):
            a=inst.get("attributes") or {}
            if a.get("display_name") != expected_display or a.get("shape") != expected_shape:
                continue
            sd=a.get("source_details") or []
            source_id=(sd[0] if sd else {}).get("source_id")
            if source_id:
                matches.append(source_id)
    if len(matches) != 1:
        raise SystemExit(f"state image lookup failed for {expected_display}: count={len(matches)}")
    return matches[0]

edge=image_for("edge","teswa-edge-01","VM.Standard.E2.1.Micro")
core=image_for("core","teswa-core-01","VM.Standard.A1.Flex")
print(edge+"|"+core)
PY
)" || { echo "phase8_caddy_boot_plan=FAIL reason=state_image_lookup" >&2; exit 4; }

EDGE_IMAGE="${IMAGES%%|*}"
CORE_IMAGE="${IMAGES#*|}"
[ -n "$EDGE_IMAGE" ] && [ -n "$CORE_IMAGE" ] && [ "$EDGE_IMAGE" != "$IMAGES" ] || {
  echo "phase8_caddy_boot_plan=FAIL reason=invalid_state_images" >&2
  exit 5
}

rm -f "$PLAN" "$JSON"

echo "TESWA PHASE 8 EDGE CADDY BOOT REPLACEMENT PLAN"
echo "mode=plan-only"
echo "target=teswa-edge-01"
echo "replacement_scope=edge_only"
echo "caddy_install=verified_static_release"
echo "run_command_dependency=none"
echo "dns_change=none_expected"
echo "public_listener=none_expected"
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

print("PHASE8 EDGE CADDY BOOT PLAN GUARD")
for addr,actions,_ in changes:
    print(f"planned_resource={addr} actions={actions}")

if len(changes) != 1:
    print(f"phase8_caddy_boot_plan_guard=FAIL reason=unexpected_change_count count={len(changes)}")
    raise SystemExit(10)
addr,actions,after=changes[0]
if addr != "oci_core_instance.edge[0]" or set(actions) != {"create","delete"}:
    print(f"phase8_caddy_boot_plan_guard=FAIL reason=unexpected_actions address={addr} actions={actions}")
    raise SystemExit(11)

metadata=after.get("metadata") or {}
if set(metadata) != {"user_data"}:
    print(f"phase8_caddy_boot_plan_guard=FAIL reason=unexpected_metadata_keys keys={sorted(metadata)}")
    raise SystemExit(12)
try:
    payload=base64.b64decode(metadata.get("user_data") or "").decode("utf-8")
except Exception:
    print("phase8_caddy_boot_plan_guard=FAIL reason=user_data_decode")
    raise SystemExit(13)

required=[
    'ocarun ALL=(ALL) NOPASSWD:ALL',
    'CADDY_VERSION="2.11.4"',
    'sha512sum -c caddy_asset_checksum.txt',
    '/usr/bin/caddy validate --config /etc/caddy/Caddyfile',
    'http://127.0.0.1:8080',
    'TESWA_PHASE8_CADDY_BOOT=PASS',
    'public_listener=false',
]
missing=[x for x in required if x not in payload]
if missing:
    print(f"phase8_caddy_boot_plan_guard=FAIL reason=bootstrap_markers_missing missing={missing}")
    raise SystemExit(14)

for forbidden in ('ssh_authorized_keys','dnf copr','dnf install','firewall-cmd --add-port','firewall-cmd --add-service'):
    if forbidden in payload:
        print(f"phase8_caddy_boot_plan_guard=FAIL reason=forbidden_bootstrap_content marker={forbidden}")
        raise SystemExit(15)

vnic=after.get("create_vnic_details") or []
if not vnic or str(vnic[0].get("assign_public_ip")).lower() != "true":
    print("phase8_caddy_boot_plan_guard=FAIL reason=edge_public_vnic_changed")
    raise SystemExit(16)

print("planned_replacements=1")
print("planned_other_changes=0")
print("run_command_dependency=none")
print("caddy_version_pinned=2.11.4")
print("checksum_verification=true")
print("listen_address=127.0.0.1")
print("port=8080")
print("public_listener=false")
print("ssh_authorized_keys_present=false")
print("phase8_caddy_boot_plan_guard=PASS")
PY

echo "saved_plan=$PLAN"
echo "No OCI resources were changed."
echo "Apply only this exact saved plan after the guard prints PASS."
