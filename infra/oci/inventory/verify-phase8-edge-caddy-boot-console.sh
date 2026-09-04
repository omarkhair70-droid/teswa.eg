#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-15}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-480}"
DISPLAY_NAME="teswa-phase8-caddy-boot-verify"
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
LIST_JSON="$(mktemp)"
CURRENT_HISTORY_ID=""
cleanup_current() {
  if [ -n "$CURRENT_HISTORY_ID" ]; then
    oci compute console-history delete \
      --instance-console-history-id "$CURRENT_HISTORY_ID" \
      --force >/dev/null 2>&1 || true
    CURRENT_HISTORY_ID=""
  fi
}
cleanup() {
  cleanup_current
  rm -f "$TMP" "$LIST_JSON"
}
trap cleanup EXIT INT TERM

cleanup_stale_verifier_histories() {
  local attempt=1
  local ok=false
  : > "$LIST_JSON"

  while [ "$attempt" -le 4 ]; do
    if oci compute console-history list \
      --compartment-id "$COMPARTMENT" \
      --instance-id "$EDGE_ID" \
      --all \
      --output json > "$LIST_JSON"; then
      if python3 - "$LIST_JSON" <<'PY'
import json,sys
p=sys.argv[1]
try:
    with open(p,encoding="utf-8") as f:
        obj=json.load(f)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if isinstance(obj,dict) and isinstance(obj.get("data",[]),list) else 1)
PY
      then
        ok=true
        break
      fi
    fi
    echo "console_history_list_retry=$attempt"
    sleep 3
    attempt=$((attempt + 1))
  done

  if [ "$ok" != true ]; then
    echo "phase8_caddy_boot_console_verify=FAIL reason=console_history_list_unavailable" >&2
    echo "hint=no_guest_or_terraform_mutation_occurred" >&2
    return 1
  fi

  local ids
  ids="$(python3 - "$LIST_JSON" "$DISPLAY_NAME" <<'PY'
import json,sys
path,name=sys.argv[1:]
with open(path,encoding="utf-8") as f:
    rows=json.load(f).get("data",[])
for row in rows:
    if row.get("display-name")==name and row.get("id"):
        print(row["id"])
PY
)"

  local count=0
  while IFS= read -r history_id; do
    [ -n "$history_id" ] || continue
    oci compute console-history delete \
      --instance-console-history-id "$history_id" \
      --force >/dev/null
    count=$((count + 1))
  done <<< "$ids"
  echo "stale_verifier_histories_deleted=$count"
}

echo "TESWA PHASE 8 EDGE CADDY BOOT CONSOLE VERIFY"
echo "target=teswa-edge-01"
echo "guest_command_created=false"
echo "run_command_dependency=none"
echo "console_history_capture=ephemeral"
echo "max_wait_seconds=$MAX_WAIT_SECONDS"

# Previous verifier revisions retained every poll capture until process exit and
# could hit OCI's per-instance console-history limit. Remove only histories
# created by this verifier, never unrelated operator/recovery histories.
cleanup_stale_verifier_histories

elapsed=0
last_marker=""
while true; do
  CURRENT_HISTORY_ID="$(oci compute console-history capture \
    --instance-id "$EDGE_ID" \
    --display-name "$DISPLAY_NAME" \
    --wait-for-state SUCCEEDED \
    --wait-interval-seconds 5 \
    --query 'data.id' \
    --raw-output)"

  [ -n "$CURRENT_HISTORY_ID" ] && [ "$CURRENT_HISTORY_ID" != "null" ] && [ "$CURRENT_HISTORY_ID" != "None" ] || {
    echo "phase8_caddy_boot_console_verify=FAIL reason=console_capture_missing_id" >&2
    exit 3
  }

  : > "$TMP"
  oci compute console-history get-content \
    --instance-console-history-id "$CURRENT_HISTORY_ID" \
    --file "$TMP"

  # Recycle this capture immediately so repeated polling cannot exhaust OCI's
  # console-history quota.
  cleanup_current

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
    echo "--- console_tail ---"
    tail -n 80 "$TMP" | tr -cd '\11\12\15\40-\176'
    echo "--- end_console_tail ---"
    echo "phase8_caddy_boot_console_verify=FAIL reason=boot_marker_not_found_after_wait"
    echo "hint=inspect_cloud_init_console_output_before_any_replacement_or_runtime_mutation"
    exit 5
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
