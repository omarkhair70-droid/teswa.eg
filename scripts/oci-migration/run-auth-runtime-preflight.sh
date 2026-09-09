#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only Lane 4 preflight for the next auth-runtime step.
# It does not re-run the database/data or identity-anchor gates and performs no mutation.

export USER="${USER:-$(id -un)}"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "auth_runtime_preflight=FAIL reason=core_instance_not_found" >&2
  exit 2
}

COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" \
  --query 'data."compartment-id"' --raw-output)"

SCRIPT_TEXT='set -Eeuo pipefail
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

echo "TESWA LANE 4 AUTH RUNTIME PREFLIGHT"
echo "target=teswa-core-01"
echo "database=$DB"
echo "database_mutation=none"
echo "supabase_mutation=none"
echo "production_cutover=none"

systemctl is-active --quiet postgresql-17 || { echo "auth_runtime_preflight=FAIL reason=postgres_inactive"; exit 10; }
[ -x "$P" ] || { echo "auth_runtime_preflight=FAIL reason=psql_missing"; exit 11; }
command -v podman >/dev/null 2>&1 || { echo "auth_runtime_preflight=FAIL reason=podman_missing"; exit 12; }

api_active=false
api_enabled=false
systemctl is-active --quiet teswa-api && api_active=true || true
systemctl is-enabled --quiet teswa-api >/dev/null 2>&1 && api_enabled=true || true

health_code="$(curl -sS -o /var/tmp/teswa-auth-preflight-health.$$ -w "%{http_code}" http://127.0.0.1:3100/healthz || true)"
health_mode="$(python3 - /var/tmp/teswa-auth-preflight-health.$$ <<"PY"
import json,sys
try:
    x=json.load(open(sys.argv[1]))
    print(x.get("mode", "unknown"))
except Exception:
    print("unreadable")
PY
)"
rm -f /var/tmp/teswa-auth-preflight-health.$$

auth_code="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/v1/auth/session || true)"

users="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.users")"
identities="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.external_identities")"
fks="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='"'"'f'"'"' AND c.confrelid='"'"'teswa_identity.users'"'"'::regclass AND n.nspname='"'"'public'"'"'")"
forced="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='"'"'teswa_identity'"'"' AND c.relkind='"'"'r'"'"' AND c.relrowsecurity AND c.relforcerowsecurity")"

listener_local=false
ss -ltnH | grep -Eq "[[:space:]]127\\.0\\.0\\.1:3100[[:space:]]" && listener_local=true || true
listener_public=false
ss -ltnH | grep -Eq "[[:space:]](0\\.0\\.0\\.0|\\[::\\]|\\*):3100[[:space:]]" && listener_public=true || true

echo "api_service_active=$api_active"
echo "api_service_enabled=$api_enabled"
echo "api_health_http=$health_code"
echo "api_health_mode=$health_mode"
echo "auth_session_route_http=$auth_code"
echo "identity_users=$users"
echo "identity_mappings=$identities"
echo "identity_fks=$fks"
echo "identity_forced_rls_tables=$forced"
echo "api_listener_local=$listener_local"
echo "api_listener_public=$listener_public"

[ "$api_active" = true ] || exit 20
[ "$api_enabled" = true ] || exit 21
[ "$health_code" = 200 ] || exit 22
[ "$users" = 32 ] || exit 23
[ "$identities" = 32 ] || exit 24
[ "$fks" = 21 ] || exit 25
[ "$forced" = 2 ] || exit 26
[ "$listener_local" = true ] || exit 27
[ "$listener_public" = false ] || exit 28

echo "auth_runtime_present=$([ "$auth_code" = 200 ] && echo true || echo false)"
echo "auth_runtime_preflight=PASS"'

bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$bytes"
[ "$bytes" -le 4096 ] || { echo "auth_runtime_preflight=FAIL reason=run_command_text_limit"; exit 3; }

C="$(mktemp)"; T="$(mktemp)"
trap 'rm -f "$C" "$T"' EXIT
python3 - "$C" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({"source":{"sourceType":"TEXT","text":sys.argv[2]},"output":{"outputType":"TEXT"}},open(sys.argv[1],"w"))
PY
python3 - "$T" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({"instanceId":sys.argv[2]},open(sys.argv[1],"w"))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" \
  --content "file://$C" --target "file://$T" --timeout-in-seconds 300 \
  --display-name "teswa-lane4-auth-runtime-preflight" --query 'data.id' --raw-output)"

echo "command_id=$CID"
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys; c=json.load(sys.stdin)["data"].get("content") or {}; print(c.get("text", "")); print(c.get("message", ""))'
      [ "$S" = SUCCEEDED ] || exit 4
      break
      ;;
  esac
  sleep 3
done
