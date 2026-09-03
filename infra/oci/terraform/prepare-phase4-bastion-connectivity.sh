#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
OUT="${TESWA_PHASE4_BASTION_CONNECTIVITY_VARS:-phase4-bastion-connectivity.local.tfvars}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CORE_IP="$("$TF" output -raw teswa_core_private_ip)"

python3 - "$CORE_IP" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1].strip())
if ip.version != 4 or not ip.is_private:
    raise SystemExit("unexpected Core private IPv4 address")
print("core_private_ipv4_valid=true")
PY

umask 077
cat >"$OUT" <<EOF
enable_admin_bastion_connectivity = true
admin_bastion_target_cidr = "$CORE_IP/32"
EOF
chmod 600 "$OUT"

echo "TESWA PHASE 4 BASTION CONNECTIVITY PREFLIGHT"
echo "target=teswa-core-01"
echo "target_cidr_scope=/32"
echo "local_var_file=$OUT"
echo "local_var_file_permissions=$(stat -c '%a' "$OUT")"
echo "preflight=PASS"
echo "No OCI resources were changed."
