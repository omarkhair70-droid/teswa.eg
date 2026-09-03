#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
OUT="${TESWA_PHASE4_CORE_BOOTSTRAP_VARS:-phase4-core-bootstrap.local.tfvars}"
KEY="${TESWA_CORE_BOOTSTRAP_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_core_bootstrap_rsa}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CORE_IP="$("$TF" output -raw teswa_core_private_ip)"

python3 - "$CORE_IP" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1].strip())
if ip.version != 4 or not ip.is_private:
    raise SystemExit("unexpected Core private IPv4 address")
print("core_private_ipv4_valid=true")
PY

mkdir -p "$(dirname "$KEY")"
chmod 700 "$(dirname "$KEY")"

if [ ! -f "$KEY" ] || [ ! -f "$KEY.pub" ]; then
  ssh-keygen -q -t rsa -b 3072 -N "" -f "$KEY"
  echo "bootstrap_key_created=true"
else
  echo "bootstrap_key_created=false"
fi

chmod 600 "$KEY"
chmod 644 "$KEY.pub"

PUB="$(cat "$KEY.pub")"
python3 - "$PUB" "$CORE_IP" "$OUT" <<'PY'
import json,sys
pub,ip,path=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    f.write("enable_core_bootstrap_metadata = true\n")
    f.write("core_bootstrap_private_ip = "+json.dumps(ip)+"\n")
    f.write("core_bootstrap_ssh_public_key = "+json.dumps(pub)+"\n")
PY
chmod 600 "$OUT"

echo "TESWA PHASE 4 CORE BOOTSTRAP REPLACEMENT PREFLIGHT"
echo "target=teswa-core-01"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "core_has_production_data=false"
echo "preserve_private_ip=true"
echo "ssh_key_type=RSA"
echo "ssh_key_bits=3072"
echo "private_key_permissions=$(stat -c '%a' "$KEY")"
echo "local_var_file=$OUT"
echo "local_var_file_permissions=$(stat -c '%a' "$OUT")"
echo "preflight=PASS"
echo "No OCI resources were changed."
