#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_CORE_BOOTSTRAP_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_core_bootstrap_rsa}"
OUT="${TESWA_PHASE4_CORE_SERIAL_RECOVERY_COMMANDS:-phase4-core-serial-recovery.commands.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "serial_recovery_preflight=FAIL reason=core_not_running" >&2
  exit 2
}

[ -f "$KEY" ] && [ -f "$KEY.pub" ] || {
  echo "serial_recovery_preflight=FAIL reason=bootstrap_key_missing" >&2
  echo "Expected: $KEY and $KEY.pub" >&2
  exit 3
}

chmod 600 "$KEY"
chmod 644 "$KEY.pub"

STATE="$(oci compute instance get   --instance-id "$CORE_ID"   --query 'data."lifecycle-state"'   --raw-output)"

SHAPE="$(oci compute instance get   --instance-id "$CORE_ID"   --query 'data.shape'   --raw-output)"

[ "$STATE" = "RUNNING" ] || {
  echo "serial_recovery_preflight=FAIL reason=core_state_$STATE" >&2
  exit 4
}

[ "$SHAPE" = "VM.Standard.A1.Flex" ] || {
  echo "serial_recovery_preflight=FAIL reason=unexpected_core_shape" >&2
  exit 5
}

ACTIVE_COUNT="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'length(data[?("lifecycle-state"==`ACTIVE` || "lifecycle-state"==`CREATING`)])'   --raw-output)"

case "$ACTIVE_COUNT" in
  ''|null|None)
    echo "serial_recovery_preflight=FAIL reason=console_connection_count_unresolved" >&2
    exit 6
    ;;
  *[!0-9]*)
    echo "serial_recovery_preflight=FAIL reason=unexpected_console_connection_count value=$ACTIVE_COUNT" >&2
    exit 6
    ;;
esac

PUB="$(cat "$KEY.pub")"

umask 077
python3 - "$OUT" "$PUB" <<'PY'
import sys
path,pub=sys.argv[1:]
commands=f"""# Run only after the serial console has booted teswa-core-01 into a root bash maintenance shell.
# Oracle Linux recovery payload. No secrets are embedded.

/usr/sbin/load_policy -i
/bin/mount -o remount,rw /

install -d -m 0700 -o opc -g opc /home/opc/.ssh
cat > /home/opc/.ssh/authorized_keys <<'TESWA_SSH_KEY'
{pub}
TESWA_SSH_KEY
chown opc:opc /home/opc/.ssh/authorized_keys
chmod 0600 /home/opc/.ssh/authorized_keys
restorecon -RF /home/opc/.ssh

install -d -m 0750 /etc/sudoers.d
printf '%s\\n' 'ocarun ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/101-oracle-cloud-agent-run-command
chmod 0440 /etc/sudoers.d/101-oracle-cloud-agent-run-command
/usr/sbin/visudo -cf /etc/sudoers.d/101-oracle-cloud-agent-run-command
restorecon -v /etc/sudoers.d/101-oracle-cloud-agent-run-command

sync
echo 'serial_repair_payload=PASS'
/usr/sbin/reboot -f
"""
with open(path,"w",encoding="utf-8") as f:
    f.write(commands)
PY
chmod 600 "$OUT"

echo "TESWA PHASE 4 CORE SERIAL-CONSOLE RECOVERY PREFLIGHT"
echo "mutation=none"
echo "core_running=true"
echo "core_shape=VM.Standard.A1.Flex"
echo "serial_console_supported_vm=true"
echo "bootstrap_private_key_present=true"
echo "bootstrap_private_key_permissions=$(stat -c '%a' "$KEY")"
echo "active_or_creating_console_connections=$ACTIVE_COUNT"
echo "maintenance_payload_file=$OUT"
echo "maintenance_payload_permissions=$(stat -c '%a' "$OUT")"
echo "a1_replacement_required=false"
echo "e2_helper_required=false"
echo "host_capacity_dependency=none"
echo "serial_recovery_preflight=PASS"
echo "No OCI resources or guest files were changed."
