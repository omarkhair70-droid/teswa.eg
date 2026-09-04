#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "OCI CLI not found" >&2; exit 1; }

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
  echo "phase8_console_history_controlplane=FAIL reason=edge_not_running" >&2
  exit 2
}

OUT="$(mktemp)"
ERR="$(mktemp)"
trap 'rm -f "$OUT" "$ERR"' EXIT

set +e
oci compute console-history list \
  --compartment-id "$COMPARTMENT" \
  --instance-id "$EDGE_ID" \
  --limit 100 \
  --output json >"$OUT" 2>"$ERR"
RC=$?
set -e

echo "TESWA PHASE 8 CONSOLE HISTORY CONTROL-PLANE DIAGNOSTIC"
echo "target=teswa-edge-01"
echo "guest_command_created=false"
echo "terraform_mutation=none"
echo "console_history_mutation=none"
echo "list_exit_code=$RC"
echo "stdout_bytes=$(wc -c < "$OUT" | tr -d ' ')"
echo "stderr_bytes=$(wc -c < "$ERR" | tr -d ' ')"

if [ -s "$ERR" ]; then
  echo "--- stderr ---"
  sed -n '1,120p' "$ERR"
  echo "--- end_stderr ---"
fi

if [ "$RC" -ne 0 ]; then
  echo "phase8_console_history_controlplane=FAIL reason=list_command_failed"
  exit 3
fi

if [ ! -s "$OUT" ]; then
  echo "phase8_console_history_controlplane=FAIL reason=list_returned_empty_stdout"
  exit 4
fi

python3 - "$OUT" <<'PY'
import json,sys
p=sys.argv[1]
try:
    obj=json.load(open(p,encoding='utf-8'))
except Exception as e:
    print(f"json_valid=false")
    print(f"json_error={type(e).__name__}:{e}")
    raise SystemExit(5)
rows=obj.get('data',[]) if isinstance(obj,dict) else []
print('json_valid=true')
print(f'history_count={len(rows)}')
for i,row in enumerate(rows,1):
    print(f'history_{i:02d}_id={row.get("id","")}')
    print(f'history_{i:02d}_display_name={row.get("display-name","")}')
    print(f'history_{i:02d}_state={row.get("lifecycle-state","")}')
print('phase8_console_history_controlplane=PASS')
PY
