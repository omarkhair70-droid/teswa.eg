#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

if [ "${TESWA_ALLOW_CORE_POSTGRES17:-}" != "YES" ]; then
  echo "Refusing guest mutation: set TESWA_ALLOW_CORE_POSTGRES17=YES." >&2
  exit 2
fi

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
  exit 3
}

SCRIPT_TEXT='set -Eeuo pipefail
echo "run_as_user=$(id -un)"
sudo -n true
[ "$(uname -m)" = "aarch64" ] || { echo "postgres17_bootstrap=FAIL reason=unexpected_arch"; exit 19; }
PGDATA=/var/lib/pgsql/17/data
MARK=/etc/teswa/phase4-postgres17-owned
PSQL=/usr/pgsql-17/bin/psql
CREATEDB=/usr/pgsql-17/bin/createdb
REQ=(postgresql17 postgresql17-server postgresql17-contrib)
if sudo test -f "$PGDATA/PG_VERSION" && ! sudo test -f "$MARK"; then
  echo "postgres17_bootstrap=FAIL reason=unowned_existing_cluster"; exit 20
fi
if sudo test -f "$PGDATA/PG_VERSION"; then
  pgdata_major="$(sudo cat "$PGDATA/PG_VERSION")"
  [ "$pgdata_major" = "17" ] || { echo "postgres17_bootstrap=FAIL reason=unexpected_cluster_major_$pgdata_major"; exit 21; }
fi
if ! rpm -q pgdg-redhat-repo >/dev/null 2>&1; then
  sudo dnf -qy install https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-aarch64/pgdg-redhat-repo-latest.noarch.rpm
fi
sudo dnf -qy module disable postgresql || true
missing=0
for p in "${REQ[@]}"; do rpm -q "$p" >/dev/null 2>&1 || missing=1; done
if [ "$missing" -eq 1 ]; then
  set +e
  sudo dnf -qy install "${REQ[@]}"
  dnf_rc=$?
  set -e
  missing=0
  for p in "${REQ[@]}"; do rpm -q "$p" >/dev/null 2>&1 || missing=1; done
  if [ "$missing" -ne 0 ]; then
    echo "postgres17_bootstrap=FAIL reason=packages_missing_after_dnf rc=$dnf_rc"; exit 29
  fi
  if [ "$dnf_rc" -ne 0 ]; then
    echo "dnf_nonzero_but_required_packages_present=true rc=$dnf_rc"
  fi
else
  echo "required_packages_already_present=true"
fi
sudo install -d -m 0755 /etc/teswa
if ! sudo test -f "$PGDATA/PG_VERSION"; then
  sudo touch "$MARK"
  sudo /usr/pgsql-17/bin/postgresql-17-setup initdb >/dev/null
else
  echo "cluster_already_initialized=true"
fi
tmp="$(mktemp)"
sudo sed "/^# BEGIN TESWA PHASE4$/,/^# END TESWA PHASE4$/d" "$PGDATA/postgresql.conf" >"$tmp"
cat >>"$tmp" <<"EOF"
# BEGIN TESWA PHASE4
listen_addresses = '\''127.0.0.1'\''
port = 5432
password_encryption = '\''scram-sha-256'\''
# END TESWA PHASE4
EOF
sudo install -o postgres -g postgres -m 0600 "$tmp" "$PGDATA/postgresql.conf"
sudo restorecon "$PGDATA/postgresql.conf" >/dev/null 2>&1 || true
rm -f "$tmp"
sudo systemctl enable postgresql-17 >/dev/null
sudo systemctl restart postgresql-17
if ! sudo -u postgres "$PSQL" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='\''teswa_rehearsal'\''" | grep -qx 1; then
  sudo -u postgres "$CREATEDB" teswa_rehearsal
fi
major="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW server_version_num" | cut -c1-2)"
listen="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW listen_addresses")"
port="$(sudo -u postgres "$PSQL" -d postgres -Atqc "SHOW port")"
rels="$(sudo -u postgres "$PSQL" -d teswa_rehearsal -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='\''public'\'' AND c.relkind IN ('\''r'\'','\''p'\'','\''v'\'','\''m'\'','\''f'\'')")"
[ "$major" = "17" ] || { echo "postgres17_bootstrap=FAIL reason=major_$major"; exit 22; }
[ "$listen" = "127.0.0.1" ] || { echo "postgres17_bootstrap=FAIL reason=listen_$listen"; exit 23; }
[ "$port" = "5432" ] || { echo "postgres17_bootstrap=FAIL reason=port_$port"; exit 24; }
[ "$rels" = "0" ] || { echo "postgres17_bootstrap=FAIL reason=nonempty_public"; exit 25; }
systemctl is-active --quiet postgresql-17 || { echo "postgres17_bootstrap=FAIL reason=service_inactive"; exit 26; }
if ss -lnt | grep -Eq "(^|[[:space:]])(0\\.0\\.0\\.0|\\[::\\]):5432([[:space:]]|$)"; then
  echo "postgres17_bootstrap=FAIL reason=public_listener"; exit 27
fi
if sudo firewall-cmd --query-port=5432/tcp >/dev/null 2>&1; then
  echo "postgres17_bootstrap=FAIL reason=firewall_5432_open"; exit 28
fi
echo "postgres_major=17"
echo "listen_addresses=127.0.0.1"
echo "port=5432"
echo "rehearsal_db=teswa_rehearsal"
echo "public_relations=0"
echo "firewall_5432_open=false"
echo "credentials_created=false"
echo "data_migration=none"
echo "postgres17_bootstrap=PASS"'

SCRIPT_BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 4 CORE POSTGRESQL 17 APPLY"
echo "mutation=core_postgresql17_only"
echo "target=teswa-core-01"
echo "listen_target=127.0.0.1:5432"
echo "rehearsal_db=teswa_rehearsal"
echo "credentials_created=false"
echo "data_migration=none"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "automatic_reboot=false"
echo "guest_script_bytes=$SCRIPT_BYTES"

if [ "$SCRIPT_BYTES" -gt 4096 ]; then
  echo "postgres17_bootstrap=FAIL reason=run_command_plaintext_limit" >&2
  exit 4
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
  --timeout-in-seconds 1200 \
  --display-name "teswa-phase4-core-postgres17" \
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
if c.get("exit-code") not in (0,None): raise SystemExit(5)
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
    echo "postgres17_bootstrap=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
