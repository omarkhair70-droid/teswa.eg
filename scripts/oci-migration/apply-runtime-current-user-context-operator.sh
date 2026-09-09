#!/usr/bin/env bash
set -Eeuo pipefail

# Guarded Lane 4 operator: install and verify the Teswa-owned transaction-local
# database identity primitive on teswa_rehearsal only.
# No Supabase mutation, no production cutover, no app traffic switch.

export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET="teswa-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/runtime-context.tar.gz"
CONTENT_FILE="$WORK/content.json"
TARGET_FILE="$WORK/target.json"
UPLOADED=false

cleanup() {
  rm -rf "$WORK"
  if [ "$UPLOADED" = true ]; then
    oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for f in runtime-current-user-context.sql verify-runtime-current-user-context.sql; do
  [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "runtime_context_operator=FAIL reason=missing_$f" >&2; exit 2; }
done

cp "$ROOT/scripts/oci-migration/runtime-current-user-context.sql" "$WORK/"
cp "$ROOT/scripts/oci-migration/verify-runtime-current-user-context.sql" "$WORK/"
tar -C "$WORK" -czf "$ARCHIVE" runtime-current-user-context.sql verify-runtime-current-user-context.sql
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/runtime-context/$STAMP-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo 'runtime_context_operator=FAIL reason=core_instance_not_found' >&2; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || { echo 'runtime_context_operator=FAIL reason=target_not_running' >&2; exit 4; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true

echo "TESWA LANE 4 RUNTIME USER CONTEXT OPERATOR"
echo "target=$LIVE_NAME"
echo "database=teswa_rehearsal"
echo "supabase_mutation=none"
echo "production_cutover=none"
echo "app_traffic_switch=none"
echo "artifact_sha256=$SHA"

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'
SHA='__SHA__'
DB=teswa_rehearsal
P=/usr/pgsql-17/bin/psql
DIR="$(mktemp -d /var/tmp/teswa-runtime-context-XXXXXX)"
trap 'rm -rf "$DIR"' EXIT

echo "guest_hostname=$(hostname -s)"
echo "database_target=$DB"
echo "supabase_mutation=none"
echo "production_cutover=none"
sudo -n true || { echo 'runtime_context_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
systemctl is-active --quiet postgresql-17 || { echo 'runtime_context_operator=FAIL reason=postgres_inactive'; exit 11; }
sudo -u postgres "$P" --version >/dev/null 2>&1 || { echo 'runtime_context_operator=FAIL reason=psql_unavailable'; exit 12; }

users="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM teswa_identity.users')"
ids="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM teswa_identity.external_identities')"
[ "$users" = 32 ] && [ "$ids" = 32 ] || { echo "runtime_context_operator=FAIL reason=identity_anchor_not_green users=$users identities=$ids"; exit 13; }
echo "identity_users=$users"
echo "identity_mappings=$ids"

python3 - "$OBJ" "$DIR/runtime-context.tar.gz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$DIR/runtime-context.tar.gz" | sha256sum -c - >/dev/null || { echo 'runtime_context_operator=FAIL reason=artifact_sha_mismatch'; exit 14; }
tar -xzf "$DIR/runtime-context.tar.gz" -C "$DIR"

state="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT CASE WHEN to_regprocedure('teswa_runtime.current_user_id()') IS NULL THEN 'absent' ELSE 'present' END")"
echo "runtime_context_state_before=$state"
if [ "$state" = absent ]; then
  sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/runtime-current-user-context.sql"
  echo 'runtime_context_apply=PASS'
else
  echo 'runtime_context_apply=SKIP_ALREADY_PRESENT'
fi
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/verify-runtime-current-user-context.sql"

owner="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='teswa_runtime.current_user_id()'::regprocedure")"
public_exec="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT has_function_privilege('public','teswa_runtime.current_user_id()','EXECUTE')")"
echo "runtime_function_owner=$owner"
echo "public_execute_current_user_id=$public_exec"
[ "$public_exec" = f ] || { echo 'runtime_context_operator=FAIL reason=public_execute_not_revoked'; exit 15; }

echo 'transaction_local_identity_context=PASS'
echo 'runtime_context_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'runtime_context_operator=FAIL reason=run_command_text_limit' >&2; exit 5; }

python3 - "$CONTENT_FILE" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET_FILE" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" \
  --content "file://$CONTENT_FILE" --target "file://$TARGET_FILE" \
  --timeout-in-seconds 300 --display-name 'teswa-lane4-runtime-user-context' \
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

oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null
UPLOADED=false
echo 'runtime_context_artifact_cleanup=PASS'
echo 'runtime_context_operator_cloudshell=PASS'
