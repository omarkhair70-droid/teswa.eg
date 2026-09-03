#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-core-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "teswa-core-01 is not RUNNING." >&2
  exit 2
}

SCRIPT_TEXT='set -u
PGDATA=/var/lib/pgsql/17/data
PSQL=/usr/pgsql-17/bin/psql
POSTGRES=/usr/pgsql-17/bin/postgres
printf "run_as_user=%s\n" "$(id -un)"
echo "TESWA PHASE 4 POSTGRES17 RUNTIME DIAGNOSTIC"
echo "mutation=none"
echo "target=teswa-core-01"
echo

echo "[cluster_markers]"
for f in /etc/teswa/phase4-postgres17-owned "$PGDATA/PG_VERSION"; do
  if sudo test -e "$f"; then echo "$f=present"; else echo "$f=absent"; fi
done
if sudo test -r "$PGDATA/PG_VERSION"; then printf "pg_version="; sudo cat "$PGDATA/PG_VERSION"; fi

echo
echo "[ownership_modes]"
sudo stat -c "%n owner=%U group=%G mode=%a type=%F" "$PGDATA" "$PGDATA/postgresql.conf" "$PGDATA/pg_hba.conf" 2>&1 || true

echo
echo "[systemd]"
systemctl is-enabled postgresql-17 2>&1 || true
systemctl is-active postgresql-17 2>&1 || true
sudo systemctl status postgresql-17 --no-pager -l 2>&1 | tail -n 80 || true

echo
echo "[journal]"
sudo journalctl -u postgresql-17 -n 120 --no-pager 2>&1 || true

echo
echo "[configured_values_offline]"
if sudo test -x "$POSTGRES" && sudo test -f "$PGDATA/postgresql.conf"; then
  for key in listen_addresses port data_directory hba_file; do
    printf "%s=" "$key"
    sudo -u postgres "$POSTGRES" -D "$PGDATA" -C "$key" 2>&1 || true
  done
fi

echo
echo "[teswa_config_block]"
sudo sed -n "/^# BEGIN TESWA PHASE4$/,/^# END TESWA PHASE4$/p" "$PGDATA/postgresql.conf" 2>&1 || true

echo
echo "[hba_noncomment]"
sudo awk "NF && \$1 !~ /^#/ {print}" "$PGDATA/pg_hba.conf" 2>&1 | head -n 80 || true

echo
echo "[listeners]"
ss -lntp 2>&1 | grep -E "(:5432[[:space:]])|State" || true

echo
echo "[firewall]"
sudo firewall-cmd --state 2>&1 || true
if sudo firewall-cmd --query-port=5432/tcp >/dev/null 2>&1; then echo "firewall_5432_open=true"; else echo "firewall_5432_open=false"; fi

echo
echo "[live_sql_if_available]"
if systemctl is-active --quiet postgresql-17; then
  sudo -u postgres "$PSQL" -d postgres -Atqc "SELECT current_setting('\''server_version_num'\''), current_setting('\''listen_addresses'\''), current_setting('\''port'\'');" 2>&1 || true
  sudo -u postgres "$PSQL" -d postgres -Atqc "SELECT datname FROM pg_database WHERE datname='\''teswa_rehearsal'\'';" 2>&1 || true
fi

echo "postgres17_runtime_diagnostic=PASS"'

SCRIPT_BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 4 POSTGRES17 RUNTIME DIAGNOSTIC"
echo "guest_mutation=none"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "data_migration=none"
echo "guest_script_bytes=$SCRIPT_BYTES"

if [ "$SCRIPT_BYTES" -gt 4096 ]; then
  echo "postgres17_runtime_diagnostic=FAIL reason=run_command_plaintext_limit" >&2
  exit 3
fi

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT

python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

COMMAND_ID="$(oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 480 \
  --display-name "teswa-phase4-postgres17-runtime-diagnostic" \
  --query 'data.id' \
  --raw-output)"

elapsed=0
last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$STATE" != "$last_state" ]; then
    echo "run_command_state=$STATE"
    last_state="$STATE"
  fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code")); print((c.get("text") or "").rstrip())
'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("message=%s" % (c.get("message") or "")); print((c.get("text") or "").rstrip())
'
    exit 6
  fi
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "postgres17_runtime_diagnostic=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
