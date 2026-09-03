#!/usr/bin/env bash
set -Eeuo pipefail

# Lane 4 read-only PostgreSQL target preflight via OCI Run Command.
#
# This script performs no database/schema/data mutation. It validates the
# Lane-3 handoff in place on teswa-core-01 while PostgreSQL remains localhost-only.

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "OCI CLI not found." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found." >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/oci/terraform"
[ -d "$TF_DIR" ] || { echo "Terraform directory missing: $TF_DIR" >&2; exit 1; }

cd "$TF_DIR"
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

SCRIPT_TEXT='set -Eeuo pipefail
PSQL=/usr/pgsql-17/bin/psql

echo "TESWA LANE 4 POSTGRES TARGET PREFLIGHT"
echo "mutation=none"
echo "target=teswa-core-01"
printf "run_as_user=%s\n" "$(id -un)"

[ -x "$PSQL" ] || { echo "lane4_postgres_target_preflight=FAIL reason=psql17_missing"; exit 20; }
systemctl is-active --quiet postgresql-17 || { echo "lane4_postgres_target_preflight=FAIL reason=postgres_service_inactive"; exit 21; }

VERSION_NUM="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW server_version_num;")"
MAJOR="$(( VERSION_NUM / 10000 ))"
LISTEN="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW listen_addresses;")"
PORT="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW port;")"
PASSWORD_ENCRYPTION="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW password_encryption;")"
DB_EXISTS="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SELECT count(*) FROM pg_database WHERE datname='\''teswa_rehearsal'\'';")"

if [ "$DB_EXISTS" != "1" ]; then
  echo "lane4_postgres_target_preflight=FAIL reason=rehearsal_db_missing"
  exit 22
fi

PUBLIC_RELATIONS="$(sudo -u postgres "$PSQL" -d teswa_rehearsal -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='\''public'\'' AND c.relkind IN ('\''r'\'','\''p'\'','\''v'\'','\''m'\'','\''f'\'');")"
USER_SCHEMAS="$(sudo -u postgres "$PSQL" -d teswa_rehearsal -Atqc "SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('\''pg_catalog'\'','\''information_schema'\'','\''public'\'') AND nspname NOT LIKE '\''pg_toast%'\'' AND nspname NOT LIKE '\''pg_temp_%'\'';")"
EXTENSIONS="$(sudo -u postgres "$PSQL" -d teswa_rehearsal -Atqc "SELECT string_agg(extname,'\'','\'' ORDER BY extname) FROM pg_extension;")"

if sudo firewall-cmd --query-port=5432/tcp >/dev/null 2>&1; then
  FIREWALL_OPEN=true
else
  FIREWALL_OPEN=false
fi

printf "postgres_version_num=%s\n" "$VERSION_NUM"
printf "postgres_major=%s\n" "$MAJOR"
printf "listen_addresses=%s\n" "$LISTEN"
printf "port=%s\n" "$PORT"
printf "password_encryption=%s\n" "$PASSWORD_ENCRYPTION"
printf "rehearsal_db=teswa_rehearsal\n"
printf "public_relations=%s\n" "$PUBLIC_RELATIONS"
printf "extra_user_schemas=%s\n" "$USER_SCHEMAS"
printf "extensions=%s\n" "$EXTENSIONS"
printf "firewall_5432_open=%s\n" "$FIREWALL_OPEN"

echo "[listeners]"
ss -lnt 2>/dev/null | grep -E "(:5432[[:space:]])|State" || true

[ "$MAJOR" -eq 17 ] || { echo "lane4_postgres_target_preflight=FAIL reason=wrong_major"; exit 23; }
[ "$LISTEN" = "127.0.0.1" ] || { echo "lane4_postgres_target_preflight=FAIL reason=unexpected_listen_address"; exit 24; }
[ "$PORT" = "5432" ] || { echo "lane4_postgres_target_preflight=FAIL reason=unexpected_port"; exit 25; }
[ "$PASSWORD_ENCRYPTION" = "scram-sha-256" ] || { echo "lane4_postgres_target_preflight=FAIL reason=password_encryption_not_scram"; exit 26; }
[ "$PUBLIC_RELATIONS" = "0" ] || { echo "lane4_postgres_target_preflight=FAIL reason=target_not_empty"; exit 27; }
[ "$USER_SCHEMAS" = "0" ] || { echo "lane4_postgres_target_preflight=FAIL reason=unexpected_user_schema"; exit 28; }
[ "$FIREWALL_OPEN" = "false" ] || { echo "lane4_postgres_target_preflight=FAIL reason=firewall_5432_open"; exit 29; }

echo "source_data_read=none"
echo "source_data_transfer=none"
echo "production_cutover=none"
echo "credentials_created=false"
echo "lane4_postgres_target_preflight=PASS"'

SCRIPT_BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA LANE 4 POSTGRES TARGET PREFLIGHT"
echo "guest_mutation=none"
echo "source_data_transfer=none"
echo "production_cutover=none"
echo "credentials_created=false"
echo "guest_script_bytes=$SCRIPT_BYTES"

if [ "$SCRIPT_BYTES" -gt 4096 ]; then
  echo "lane4_postgres_target_preflight=FAIL reason=run_command_plaintext_limit" >&2
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
  --display-name "teswa-lane4-postgres-target-preflight" \
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
    echo "lane4_postgres_target_preflight=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
