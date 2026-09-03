#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PUB="${TESWA_WINDOWS_CONSOLE_PUBLIC_KEY_FILE:-$HOME/teswa_windows_console.pub}"
OUT="${TESWA_WINDOWS_VNC_CONNECTION_FILE:-$HOME/teswa-windows-vnc-connection.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${TESWA_ALLOW_REPLACE_CONSOLE_CONNECTION:-}" != "YES" ]; then
  echo "Refusing console connection replacement: set TESWA_ALLOW_REPLACE_CONSOLE_CONNECTION=YES after reviewing the public-key file." >&2
  exit 2
fi

[ -f "$PUB" ] || {
  echo "console_replace=FAIL reason=public_key_file_missing file=$PUB" >&2
  exit 3
}

chmod 600 "$PUB"

python3 - "$PUB" <<'PY'
import base64,sys
line=open(sys.argv[1],encoding="utf-8").read().strip()
parts=line.split()
if len(parts) < 2 or parts[0] not in ("ssh-rsa","rsa-sha2-256","rsa-sha2-512"):
    print("console_replace=FAIL reason=unexpected_public_key_format")
    raise SystemExit(4)
try:
    base64.b64decode(parts[1] + "===")
except Exception:
    print("console_replace=FAIL reason=invalid_public_key_base64")
    raise SystemExit(5)
print("public_key_format_valid=true")
print("public_key_type="+parts[0])
PY

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "console_replace=FAIL reason=core_not_running" >&2
  exit 6
}

EXISTING="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'data[?("lifecycle-state"==`ACTIVE` || "lifecycle-state"==`CREATING`)].id | [0]'   --raw-output)"

echo "TESWA PHASE 4 CORE CONSOLE CONNECTION REKEY"
echo "target=teswa-core-01"
echo "guest_mutation=none"
echo "network_mutation=none"
echo "core_reboot=none"
echo "public_ssh_exposure=none"

if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ] && [ "$EXISTING" != "None" ]; then
  echo "existing_console_connection=true"
  oci compute instance-console-connection delete     --instance-console-connection-id "$EXISTING"     --force     --wait-for-state DELETED     --wait-for-state FAILED     --max-wait-seconds 300     --output json >/dev/null
  echo "existing_console_connection_deleted=true"
else
  echo "existing_console_connection=false"
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

oci compute instance-console-connection create   --instance-id "$CORE_ID"   --ssh-public-key-file "$PUB"   --wait-for-state ACTIVE   --wait-for-state FAILED   --max-wait-seconds 300   --output json >"$TMP"

python3 - "$TMP" "$OUT" <<'PY'
import json,sys
src,out=sys.argv[1:]
d=json.load(open(src,encoding="utf-8")).get("data",{})
state=d.get("lifecycle-state") or ""
vnc=d.get("vnc-connection-string") or ""
conn=d.get("connection-string") or ""
cid=d.get("id") or ""
if state!="ACTIVE" or not cid:
    print("console_replace=FAIL reason=new_connection_not_active")
    raise SystemExit(7)
if not vnc:
    print("console_replace=FAIL reason=vnc_connection_string_missing")
    raise SystemExit(8)

with open(out,"w",encoding="utf-8") as f:
    f.write("CONNECTION_ID="+repr(cid)+"\n")
    f.write("VNC_CONNECTION_STRING="+repr(vnc)+"\n")
    f.write("SERIAL_CONNECTION_STRING="+repr(conn)+"\n")

print("new_console_connection_state="+state)
print("vnc_connection_string_present=true")
print("serial_connection_string_present="+str(bool(conn)).lower())
print("connection_file="+out)
print("console_replace=PASS")
PY

chmod 600 "$OUT"
echo "connection_file_permissions=$(stat -c '%a' "$OUT")"
echo "No guest OS, network, or compute resource state was changed."
