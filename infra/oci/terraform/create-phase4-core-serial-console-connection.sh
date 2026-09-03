#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_CORE_BOOTSTRAP_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_core_bootstrap_rsa}"
OUT="${TESWA_PHASE4_CORE_SERIAL_CONNECTION:-phase4-core-serial-console.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${TESWA_ALLOW_CORE_SERIAL_CONSOLE:-}" != "YES" ]; then
  echo "Refusing console-connection creation: set TESWA_ALLOW_CORE_SERIAL_CONSOLE=YES after preflight review." >&2
  exit 2
fi

[ -f "$KEY" ] && [ -f "$KEY.pub" ] || {
  echo "Missing bootstrap SSH key pair. Run prepare-phase4-core-serial-console-recovery.sh first." >&2
  exit 3
}

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "serial_console_create=FAIL reason=core_not_running" >&2
  exit 4
}

EXISTING="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'data[?("lifecycle-state"==`ACTIVE` || "lifecycle-state"==`CREATING`)].id | [0]'   --raw-output)"

if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ] && [ "$EXISTING" != "None" ]; then
  echo "serial_console_create=FAIL reason=active_connection_already_exists" >&2
  echo "Delete or finish the existing console connection before creating another." >&2
  exit 5
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "TESWA PHASE 4 CORE SERIAL-CONSOLE CONNECTION CREATE"
echo "target=teswa-core-01"
echo "guest_mutation=none"
echo "network_change=none"
echo "public_ssh_exposure=none"

oci compute instance-console-connection create   --instance-id "$CORE_ID"   --ssh-public-key-file "$KEY.pub"   --wait-for-state ACTIVE   --output json >"$TMP"

python3 - "$TMP" "$KEY" "$OUT" <<'PY'
import json,sys
path,key,out=sys.argv[1:]
d=json.load(open(path,encoding="utf-8")).get("data",{})
state=d.get("lifecycle-state") or ""
conn=d.get("connection-string") or ""
cid=d.get("id") or ""
if state!="ACTIVE" or not conn or not cid:
    print("serial_console_create=FAIL reason=incomplete_connection")
    raise SystemExit(6)

# Oracle returns an SSH connection string. Substitute common private-key placeholders
# when present, but preserve the raw connection string as a comment for inspection.
candidates=[
    "private_SSH_key_path",
    "private_key_file",
    "<private_key_file>",
    "<private_SSH_key_path>",
]
adapted=conn
for token in candidates:
    adapted=adapted.replace(token,key)

with open(out,"w",encoding="utf-8") as f:
    f.write("# Teswa Core serial console connection. Generated locally; do not commit.\n")
    f.write("# connection_id="+cid+"\n")
    f.write("CONNECTION_ID="+repr(cid)+"\n")
    f.write("CONNECTION_COMMAND="+repr(adapted)+"\n")

print("session_state="+state)
print("connection_string_present=true")
print("connection_file="+out)
print("serial_console_create=PASS")
PY
chmod 600 "$OUT"

echo "connection_file_permissions=$(stat -c '%a' "$OUT")"
echo
echo "Next: source $OUT and run:"
echo 'eval "$CONNECTION_COMMAND"'
