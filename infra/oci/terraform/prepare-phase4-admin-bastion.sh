#!/usr/bin/env bash
set -Eeuo pipefail

OUT="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org)"

python3 - "$IP" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1].strip())
if ip.version != 4 or ip.is_private or ip.is_loopback:
    raise SystemExit("unexpected public IPv4 address")
print("client_ipv4_valid=true")
PY

umask 077
cat >"$OUT" <<EOF
enable_admin_bastion = true
admin_bastion_client_cidrs = ["$IP/32"]
EOF
chmod 600 "$OUT"

echo "TESWA PHASE 4 TEMP ADMIN BASTION PREFLIGHT"
echo "client_cidr_detected=yes"
echo "local_var_file=$OUT"
echo "local_var_file_permissions=$(stat -c '%a' "$OUT")"
echo "preflight=PASS"
echo "No OCI resources were changed."
