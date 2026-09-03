#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${TESWA_ALLOW_CORE_MAINTENANCE_REBOOT:-}" != "YES" ]; then
  echo "Refusing Core maintenance reboot: set TESWA_ALLOW_CORE_MAINTENANCE_REBOOT=YES after the serial console is visibly attached." >&2
  exit 2
fi

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "maintenance_reboot=FAIL reason=core_not_running" >&2
  exit 3
}

ACTIVE_CONSOLE="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'data[?("lifecycle-state"==`ACTIVE`)].id | [0]'   --raw-output)"

[ -n "$ACTIVE_CONSOLE" ] && [ "$ACTIVE_CONSOLE" != "null" ] && [ "$ACTIVE_CONSOLE" != "None" ] || {
  echo "maintenance_reboot=FAIL reason=no_active_serial_console_connection" >&2
  exit 4
}

echo "TESWA PHASE 4 CORE MAINTENANCE REBOOT TRIGGER"
echo "target=teswa-core-01"
echo "serial_console_active=true"
echo "action=SOFTRESET"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "data_migration=none"
echo "public_ssh_exposure=none"

oci compute instance action   --instance-id "$CORE_ID"   --action SOFTRESET   --output json >/dev/null

echo "softreset_requested=true"
echo "maintenance_reboot_trigger=PASS"
echo "Immediately return to the attached serial console. In browser Cloud Shell, do NOT use F5. Focus the terminal and press Ctrl+[ repeatedly (terminal ESC) to intercept UEFI/GRUB."
