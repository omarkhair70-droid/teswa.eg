#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
SESSION_NAME="teswa-ocarun-bootstrap-$(date -u +%Y%m%dT%H%M%SZ)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

BASTION_ID="$("$TF" output -raw admin_bastion_id)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

ssh-keygen -q -t ed25519 -N "" -f "$TMPDIR/session_key"

echo "TESWA PHASE 4 OCARUN SUDO BOOTSTRAP SESSION"
echo "ephemeral_key=true"
echo "session_ttl_seconds=1800"
echo

oci bastion session create-managed-ssh   --bastion-id "$BASTION_ID"   --display-name "$SESSION_NAME"   --ssh-public-key-file "$TMPDIR/session_key.pub"   --target-resource-id "$CORE_ID"   --target-os-username opc   --target-port 22   --session-ttl 1800   --wait-for-state SUCCEEDED   --wait-interval-seconds 10   >/dev/null

SESSION_ID="$(oci bastion session list   --bastion-id "$BASTION_ID"   --display-name "$SESSION_NAME"   --all   --query 'data[0].id'   --raw-output)"

[ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ] || {
  echo "session=FAIL reason=not_found" >&2
  exit 3
}

elapsed=0
while true; do
  S="$(oci bastion session get --session-id "$SESSION_ID" --output json)"
  STATE="$(printf '%s' "$S" | python3 -c '
import json,sys
print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))
')"
  if [ "$STATE" = "ACTIVE" ]; then
    break
  fi
  if [ "$STATE" = "FAILED" ]; then
    echo "session=FAIL reason=bastion_session_failed"
    exit 4
  fi
  if [ "$elapsed" -ge 300 ]; then
    echo "session=FAIL reason=activation_timeout state=$STATE"
    exit 5
  fi
  sleep 10
  elapsed=$((elapsed+10))
done

CMD="$(printf '%s' "$S" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
print((d.get("ssh-metadata") or {}).get("command",""))
')"

CMD="$(python3 - "$CMD" "$TMPDIR/session_key" <<'PY'
import re,sys
cmd,key=sys.argv[1:]
cmd=re.sub(r"<private[Kk]ey>", key, cmd)
print(cmd)
PY
)"

echo "session_state=ACTIVE"
echo
echo "Run the following SSH command in this same Cloud Shell."
echo "If SSH asks to trust an OCI bastion host key, answer yes."
echo
printf '%s
' "$CMD"
echo
echo "Then, inside teswa-core-01, run exactly:"
cat <<'EOF'
printf '%s
' 'ocarun ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/101-oracle-cloud-agent-run-command >/dev/null
sudo chmod 440 /etc/sudoers.d/101-oracle-cloud-agent-run-command
sudo visudo -cf /etc/sudoers.d/101-oracle-cloud-agent-run-command
exit
EOF
echo
echo "The ephemeral session private key exists only until this helper exits."
echo "Keep this helper terminal open while you use the printed SSH command."
read -r -p "Press Enter only after you have exited the Bastion SSH session..." _
echo "session_helper_complete=true"
