#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-15}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-480}"
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
HISTORY_IDS=()
cleanup() {
  rm -f "$TMP"
  for history_id in "${HISTORY_IDS[@]:-}"; do
    [ -n "$history_id" ] || continue
    oci compute console-history delete \
      --instance-console-history-id "$history_id" \
      --force >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

echo "TESWA PHASE 8 EDGE CADDY BOOT CONSOLE VERIFY"
echo "target=teswa-edge-01"
echo "guest_command_created=false"
echo "run_command_dependency=none"
echo "console_history_capture=ephemeral"
echo "max_wait_seconds=$MAX_WAIT_SECONDS"

elapsed=0
last_marker=""
while true; do
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
  HISTORY_IDS+=("$HISTORY_ID")

  : > "$TMP"
  oci compute console-history get-content \
    --instance-console-history-id "$HISTORY_ID" \
    --file "$TMP"

  last_marker="$(grep -a 'TESWA_PHASE8_CADDY_BOOT=' "$TMP" | tail -n 1 || true)"
  if [ -n "$last_marker" ]; then
    echo "boot_marker=$last_marker"
  else
    echo "boot_marker=not_yet_visible elapsed_seconds=$elapsed"
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

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "phase8_caddy_boot_console_verify=FAIL reason=boot_marker_not_found_after_wait"
    echo "hint=inspect_cloud_init_console_output_before_any_replacement_or_runtime_mutation"
    exit 5
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
