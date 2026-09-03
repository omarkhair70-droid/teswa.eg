#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

BASTION_ID="$("$TF" output -raw admin_bastion_id)"

CURRENT_IP="$(curl -4 -fsS --max-time 10 checkip.dyndns.org   | sed -e 's/.*Current IP Address: //' -e 's/<.*$//')"

python3 - "$CURRENT_IP" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1].strip())
if ip.version != 4 or ip.is_private or ip.is_loopback:
    raise SystemExit("unexpected Cloud Shell public IPv4 address")
PY

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

oci bastion bastion get   --bastion-id "$BASTION_ID"   --output json >"$TMP"

python3 - "$CURRENT_IP" "$TMP" <<'PY'
import ipaddress,json,sys
current,path=sys.argv[1:]
with open(path,encoding="utf-8") as f:
    d=json.load(f).get("data",{})

allow=d.get("client-cidr-block-allow-list") or []
endpoint=d.get("private-endpoint-ip-address") or ""
state=d.get("lifecycle-state") or d.get("state") or ""
jump=d.get("static-jump-host-ip-addresses") or []

ip=ipaddress.ip_address(current)
match=any(ip in ipaddress.ip_network(c, strict=False) for c in allow)

print("TESWA PHASE 4 BASTION CLIENT PATH DIAGNOSTIC")
print("mutation=none")
print("bastion_state="+state)
print("private_endpoint_assigned="+str(bool(endpoint)).lower())
print("client_public_ip_detected=true")
print("allowlist_entries=%d" % len(allow))
print("current_client_ip_allowed="+str(match).lower())
print("static_jump_host_ips=%d" % len(jump))
if not match:
    print("diagnostic=FAIL reason=current_cloud_shell_ip_not_in_bastion_allowlist")
    raise SystemExit(3)
print("diagnostic=PASS")
PY
