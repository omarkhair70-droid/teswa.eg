#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_CORE_BOOTSTRAP_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_core_bootstrap_rsa}"
OUT="${TESWA_PHASE4_CORE_SERIAL_CONNECTION:-phase4-core-serial-console.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$KEY" ] && [ -f "$KEY.pub" ] || {
  echo "serial_console_command_repair=FAIL reason=bootstrap_key_missing" >&2
  exit 2
}

chmod 600 "$KEY"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "serial_console_command_repair=FAIL reason=core_not_running" >&2
  exit 3
}

CONN_ID="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'data[?("lifecycle-state"==`ACTIVE`)].id | [0]'   --raw-output)"

[ -n "$CONN_ID" ] && [ "$CONN_ID" != "null" ] && [ "$CONN_ID" != "None" ] || {
  echo "serial_console_command_repair=FAIL reason=no_active_console_connection" >&2
  exit 4
}

CONN="$(oci compute instance-console-connection get   --instance-console-connection-id "$CONN_ID"   --query 'data."connection-string"'   --raw-output)"

[ -n "$CONN" ] && [ "$CONN" != "null" ] && [ "$CONN" != "None" ] || {
  echo "serial_console_command_repair=FAIL reason=connection_string_missing" >&2
  exit 5
}

python3 - "$CONN" "$KEY" "$CONN_ID" "$OUT" <<'PY'
import shlex,sys
conn,key,cid,out=sys.argv[1:]

# Oracle requires the selected private identity in BOTH the outer SSH command
# and the nested ProxyCommand. The service connection string may omit -i.
parts=conn.count("ssh ")
if parts < 1:
    print("serial_console_command_repair=FAIL reason=unexpected_connection_string")
    raise SystemExit(6)

keyq=shlex.quote(key)
inject=f"ssh -i {keyq} -o IdentitiesOnly=yes "
adapted=conn.replace("ssh ", inject)

with open(out,"w",encoding="utf-8") as f:
    f.write("# Teswa Core serial console connection. Generated locally; do not commit.\n")
    f.write("# connection_id="+cid+"\n")
    f.write("CONNECTION_ID="+repr(cid)+"\n")
    f.write("CONNECTION_COMMAND="+repr(adapted)+"\n")

print("active_console_connection=true")
print("ssh_command_layers="+str(parts))
print("outer_identity_injected=true")
print("proxy_identity_injected="+str(parts >= 2).lower())
print("identities_only=true")
print("connection_file="+out)
print("serial_console_command_repair=PASS")
PY

chmod 600 "$OUT"
echo "connection_file_permissions=$(stat -c '%a' "$OUT")"
echo "No OCI resources or guest files were changed."
echo
echo "Next: source $OUT and run:"
echo 'eval "$CONNECTION_COMMAND"'
