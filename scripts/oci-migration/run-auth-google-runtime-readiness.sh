#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only readiness gate after the persisted identity anchor is GREEN.
# No database mutation, no Supabase mutation, no runtime deployment.

export USER="${USER:-$(id -un)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "auth_google_runtime_readiness=FAIL reason=core_instance_not_found" >&2
  exit 2
}
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" \
  --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || {
  echo "auth_google_runtime_readiness=FAIL reason=target_not_running" >&2
  exit 3
}

GOOGLE_WEB_CLIENT_ID="$(python3 - "$ROOT/google-services.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
ids=[]
for client in x.get('client',[]):
    for row in client.get('oauth_client',[]):
        if row.get('client_type') == 3 and row.get('client_id'):
            ids.append(row['client_id'])
ids=sorted(set(ids))
assert len(ids)==1, 'expected exactly one web OAuth client id'
print(ids[0])
PY
)"
[ -n "$GOOGLE_WEB_CLIENT_ID" ] || { echo "auth_google_runtime_readiness=FAIL reason=google_web_client_missing"; exit 4; }

echo "control_plane_target=$LIVE_NAME"
echo "control_plane_state=$LIVE_STATE"
echo "google_web_client_id_present=true"

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
DB=teswa_rehearsal
P=/usr/pgsql-17/bin/psql

echo "guest_hostname=$(hostname -s)"
echo "database_mutation=none"
echo "supabase_mutation=none"
echo "production_cutover=none"

sudo -n true || { echo "auth_google_runtime_readiness=FAIL reason=no_passwordless_sudo"; exit 10; }
systemctl is-active --quiet postgresql-17 || { echo "auth_google_runtime_readiness=FAIL reason=postgres_inactive"; exit 11; }
sudo -u postgres "$P" --version >/dev/null 2>&1 || { echo "auth_google_runtime_readiness=FAIL reason=psql_unavailable"; exit 12; }

users="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.users")"
identities="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.external_identities")"
fks="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='teswa_identity.users'::regclass AND c.convalidated")"
[ "$users" = 32 ] || { echo "auth_google_runtime_readiness=FAIL reason=identity_users_$users"; exit 13; }
[ "$identities" = 32 ] || { echo "auth_google_runtime_readiness=FAIL reason=identity_mappings_$identities"; exit 14; }
[ "$fks" = 21 ] || { echo "auth_google_runtime_readiness=FAIL reason=identity_fks_$fks"; exit 15; }

echo "identity_users=$users"
echo "identity_mappings=$identities"
echo "identity_fks=$fks"

for tool in python3 openssl curl podman; do
  command -v "$tool" >/dev/null 2>&1 || { echo "auth_google_runtime_readiness=FAIL reason=missing_$tool"; exit 16; }
  echo "tool_$tool=present"
done

python3 --version 2>&1 | sed 's/^/python_version=/'
openssl version | sed 's/^/openssl_version=/'
podman --version | sed 's/^/podman_version=/'

http="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 https://www.googleapis.com/oauth2/v1/certs || true)"
[ "$http" = 200 ] || { echo "auth_google_runtime_readiness=FAIL reason=google_certs_http_$http"; exit 17; }
echo "google_certs_http=200"

api_active=false; systemctl is-active --quiet teswa-api && api_active=true || true
api_enabled=false; systemctl is-enabled --quiet teswa-api >/dev/null 2>&1 && api_enabled=true || true
auth_shadow_active=false; systemctl is-active --quiet teswa-auth-shadow && auth_shadow_active=true || true
port3100_local=false; ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3100[[:space:]]' && port3100_local=true || true
port3110_local=false; ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3110[[:space:]]' && port3110_local=true || true
port3110_public=false; ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):3110[[:space:]]' && port3110_public=true || true

echo "teswa_api_active=$api_active"
echo "teswa_api_enabled=$api_enabled"
echo "teswa_auth_shadow_active=$auth_shadow_active"
echo "port_3100_local=$port3100_local"
echo "port_3110_local=$port3110_local"
echo "port_3110_public=$port3110_public"
[ "$port3110_public" = false ] || { echo "auth_google_runtime_readiness=FAIL reason=port_3110_public"; exit 18; }

mem_mb="$(( $(awk '/MemAvailable:/ {print $2}' /proc/meminfo) / 1024 ))"
root_free_mb="$(( $(df -Pk / | awk 'NR==2 {print $4}') / 1024 ))"
echo "mem_available_mb=$mem_mb"
echo "root_free_mb=$root_free_mb"
[ "$mem_mb" -ge 512 ] || { echo "auth_google_runtime_readiness=FAIL reason=low_memory"; exit 19; }
[ "$root_free_mb" -ge 2048 ] || { echo "auth_google_runtime_readiness=FAIL reason=low_disk"; exit 20; }

echo "auth_google_shadow_deploy_ready=YES"
echo "auth_google_runtime_readiness=PASS"
GUEST
)"

BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo "auth_google_runtime_readiness=FAIL reason=run_command_text_limit"; exit 5; }

C="$(mktemp)"; T="$(mktemp)"
trap 'rm -f "$C" "$T"' EXIT
python3 - "$C" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$T" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" \
  --content "file://$C" --target "file://$T" --timeout-in-seconds 300 \
  --display-name "teswa-lane4-auth-google-runtime-readiness" \
  --query 'data.id' --raw-output)"
echo "command_id=$CID"

while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text", ""));print(c.get("message", ""))'
      [ "$S" = SUCCEEDED ] || exit 6
      break
      ;;
  esac
  sleep 3
done
