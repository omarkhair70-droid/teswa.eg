#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] && [ "$EDGE_ID" != "None" ] || {
  echo "phase8_caddy_boot_console_verify=FAIL reason=edge_not_running" >&2
  exit 2
}

TMP="$(mktemp)"
HISTORY_ID=""
cleanup() {
  rm -f "$TMP"
  if [ -n "$HISTORY_ID" ]; then
    oci compute console-history delete \
      --instance-console-history-id "$HISTORY_ID" \
      --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "TESWA PHASE 8 EDGE CADDY BOOT CONSOLE VERIFY"
echo "target=teswa-edge-01"
echo "guest_command_created=false"
echo "run_command_dependency=none"
echo "console_history_capture=ephemeral"

HISTORY_ID="$(oci compute console-history capture \
  --instance-id "$EDGE_ID" \
  --display-name teswa-phase8-caddy-boot-verify \
  --wait-for-state SUCCEEDED \
  --wait-interval-seconds 5 \
  --query 'data.id' \
  --raw-output)"

[ -n "$HISTORY_ID" ] && [ "$HISTORY_ID" != "null" ] && [ "$HISTORY_ID" != "None" ] || {
  echo "phase8_caddy_boot_console_verify=FAIL reason=console_capture_missing_id" >&2
  exit 3
}

oci compute console-history get-content \
  --instance-console-history-id "$HISTORY_ID" \
  --file "$TMP"

MARKERS="$(grep -a 'TESWA_PHASE8_CADDY_BOOT=' "$TMP" | tail -n 20 || true)"
if [ -n "$MARKERS" ]; then
  echo "--- phase8_boot_markers ---"
  printf '%s\n' "$MARKERS"
  echo "--- end_phase8_boot_markers ---"
fi

if grep -aq 'TESWA_PHASE8_CADDY_BOOT=PASS' "$TMP"; then
  PASS_LINE="$(grep -a 'TESWA_PHASE8_CADDY_BOOT=PASS' "$TMP" | tail -n 1)"
  echo "$PASS_LINE"
  echo "run_command_dependency=none"
  echo "production_cutover=none"
  echo "dns_change=none"
  echo "phase8_caddy_boot_console_verify=PASS"
  exit 0
fi

if grep -aq 'TESWA_PHASE8_CADDY_BOOT=FAIL' "$TMP"; then
  FAIL_LINE="$(grep -a 'TESWA_PHASE8_CADDY_BOOT=FAIL' "$TMP" | tail -n 1)"
  echo "$FAIL_LINE"
  echo "phase8_caddy_boot_console_verify=FAIL reason=guest_bootstrap_failed"
  exit 4
fi

echo "phase8_caddy_boot_console_verify=FAIL reason=boot_marker_not_found"
echo "hint=instance_may_still_be_bootstrapping_or_console_history_does_not_yet_include_marker"
exit 5
