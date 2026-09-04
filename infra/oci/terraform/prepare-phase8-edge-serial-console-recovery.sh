#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_EDGE_CONSOLE_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_edge_console_rsa}"
OUT="${TESWA_PHASE8_EDGE_SERIAL_RECOVERY_COMMANDS:-phase8-edge-serial-recovery.commands.local.txt}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] || {
  echo "edge_serial_recovery_preflight=FAIL reason=edge_not_running" >&2
  exit 2
}

if [ ! -f "$KEY" ] || [ ! -f "$KEY.pub" ]; then
  install -d -m 0700 "$(dirname "$KEY")"
  ssh-keygen -q -t rsa -b 4096 -N '' -C 'teswa-phase8-edge-console' -f "$KEY"
fi
chmod 600 "$KEY"
chmod 644 "$KEY.pub"

STATE="$(oci compute instance get --instance-id "$EDGE_ID" --query 'data."lifecycle-state"' --raw-output)"
SHAPE="$(oci compute instance get --instance-id "$EDGE_ID" --query 'data.shape' --raw-output)"

[ "$STATE" = "RUNNING" ] || {
  echo "edge_serial_recovery_preflight=FAIL reason=edge_state_$STATE" >&2
  exit 3
}
[ "$SHAPE" = "VM.Standard.E2.1.Micro" ] || {
  echo "edge_serial_recovery_preflight=FAIL reason=unexpected_edge_shape_$SHAPE" >&2
  exit 4
}

ACTIVE_ID="$(oci compute instance-console-connection list \
  --compartment-id "$COMPARTMENT" \
  --instance-id "$EDGE_ID" \
  --all \
  --query 'data[?("lifecycle-state"==`ACTIVE` || "lifecycle-state"==`CREATING`)].id | [0]' \
  --raw-output)"

case "$ACTIVE_ID" in
  ''|null|None) ACTIVE_COUNT=0 ;;
  *) ACTIVE_COUNT=1 ;;
esac

umask 077
cat > "$OUT" <<'EOF'
# Run only after teswa-edge-01 has been booted from the serial console into
# a root bash maintenance shell using init=/bin/bash.
# This payload changes only the Run Command sudoers grant, then reboots.

/usr/sbin/load_policy -i || true
/bin/mount -o remount,rw /
install -d -m 0750 /etc/sudoers.d
printf '%s\n' 'ocarun ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/101-oracle-cloud-agent-run-command
chmod 0440 /etc/sudoers.d/101-oracle-cloud-agent-run-command
/usr/sbin/visudo -cf /etc/sudoers.d/101-oracle-cloud-agent-run-command
restorecon -v /etc/sudoers.d/101-oracle-cloud-agent-run-command || true
sync
echo 'edge_serial_repair_payload=PASS'
/usr/sbin/reboot -f
EOF
chmod 600 "$OUT"

echo "TESWA PHASE 8 EDGE SERIAL-CONSOLE RECOVERY PREFLIGHT"
echo "mutation=none"
echo "target=teswa-edge-01"
echo "edge_running=true"
echo "edge_shape=$SHAPE"
echo "serial_console_supported_vm=true"
echo "console_private_key=$KEY"
echo "console_private_key_permissions=$(stat -c '%a' "$KEY")"
echo "active_or_creating_console_connections=$ACTIVE_COUNT"
echo "maintenance_payload_file=$OUT"
echo "maintenance_payload_permissions=$(stat -c '%a' "$OUT")"
echo "public_ssh_exposure=none"
echo "edge_serial_recovery_preflight=PASS"
echo "No OCI resources or guest files were changed."
