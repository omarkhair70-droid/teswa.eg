#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_EDGE_CONSOLE_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_edge_console_rsa}"
OUT="${TESWA_PHASE8_EDGE_SERIAL_CONNECTION:-phase8-edge-serial-console.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${TESWA_ALLOW_EDGE_SERIAL_CONSOLE:-}" != "YES" ]; then
  echo "Refusing console-connection creation: set TESWA_ALLOW_EDGE_SERIAL_CONSOLE=YES after preflight review." >&2
  exit 2
fi

[ -f "$KEY" ] && [ -f "$KEY.pub" ] || {
  echo "Missing Edge console SSH key pair. Run prepare-phase8-edge-serial-console-recovery.sh first." >&2
  exit 3
}

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] || {
  echo "edge_serial_console_create=FAIL reason=edge_not_running" >&2
  exit 4
}

EXISTING="$(oci compute instance-console-connection list \
  --compartment-id "$COMPARTMENT" \
  --instance-id "$EDGE_ID" \
  --all \
  --query 'data[?("lifecycle-state"==`ACTIVE` || "lifecycle-state"==`CREATING`)].id | [0]' \
  --raw-output)"

if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ] && [ "$EXISTING" != "None" ]; then
  echo "edge_serial_console_create=FAIL reason=active_connection_already_exists" >&2
  echo "existing_connection_id=$EXISTING" >&2
  exit 5
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "TESWA PHASE 8 EDGE SERIAL-CONSOLE CONNECTION CREATE"
echo "target=teswa-edge-01"
echo "guest_mutation=none"
echo "network_change=none"
echo "public_ssh_exposure=none"

oci compute instance-console-connection create \
  --instance-id "$EDGE_ID" \
  --ssh-public-key-file "$KEY.pub" \
  --wait-for-state ACTIVE \
  --output json > "$TMP"

python3 - "$TMP" "$KEY" "$OUT" <<'PY'
import json,shlex,sys
path,key,out=sys.argv[1:]
d=json.load(open(path,encoding="utf-8")).get("data",{})
state=d.get("lifecycle-state") or ""
conn=d.get("connection-string") or ""
cid=d.get("id") or ""
if state != "ACTIVE" or not conn or not cid:
    print("edge_serial_console_create=FAIL reason=incomplete_connection")
    raise SystemExit(6)
keyq=shlex.quote(key)
adapted=conn.replace("ssh ", f"ssh -i {keyq} -o IdentitiesOnly=yes ")
with open(out,"w",encoding="utf-8") as f:
    f.write("# Teswa Edge serial console connection. Generated locally; do not commit.\n")
    f.write("# connection_id="+cid+"\n")
    f.write("CONNECTION_ID="+repr(cid)+"\n")
    f.write("CONNECTION_COMMAND="+repr(adapted)+"\n")
print("session_state="+state)
print("connection_string_present=true")
print("connection_file="+out)
print("edge_serial_console_create=PASS")
PY
chmod 600 "$OUT"

echo "connection_file_permissions=$(stat -c '%a' "$OUT")"
echo "Next: source $OUT and run:"
echo 'eval "$CONNECTION_COMMAND"'
