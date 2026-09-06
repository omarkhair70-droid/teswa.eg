#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET=teswa-backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/direct-rls.tar.gz"
CONTENT_FILE="$WORK/content.json"
TARGET_FILE="$WORK/target.json"
UPLOADED=false
cleanup(){ rm -rf "$WORK"; if [ "$UPLOADED" = true ]; then oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

for f in runtime-direct-messaging-rls.sql verify-runtime-direct-messaging-rls.sql; do
  [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "direct_rls_operator=FAIL reason=missing_$f" >&2; exit 2; }
done
cp "$ROOT/scripts/oci-migration/runtime-direct-messaging-rls.sql" "$WORK/"
cp "$ROOT/scripts/oci-migration/verify-runtime-direct-messaging-rls.sql" "$WORK/"
tar -C "$WORK" -czf "$ARCHIVE" runtime-direct-messaging-rls.sql verify-runtime-direct-messaging-rls.sql
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/direct-rls/$STAMP-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'direct_rls_operator=FAIL reason=core_instance_not_found' >&2; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || { echo 'direct_rls_operator=FAIL reason=target_not_running' >&2; exit 4; }
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true

echo 'TESWA LANE 4 DIRECT MESSAGING RLS OPERATOR'
echo "target=$LIVE_NAME"
echo 'database=teswa_rehearsal'
echo 'policies=5'
echo 'runtime_role=teswa_app_authenticated'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo "artifact_sha256=$SHA"

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; DB=teswa_rehearsal; P=/usr/pgsql-17/bin/psql
DIR="$(mktemp -d /var/tmp/teswa-direct-rls-XXXXXX)"; trap 'rm -rf "$DIR"' EXIT
sudo -n true || { echo 'direct_rls_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
systemctl is-active --quiet postgresql-17 || { echo 'direct_rls_operator=FAIL reason=postgres_inactive'; exit 11; }
ctx="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT CASE WHEN to_regprocedure('teswa_runtime.current_user_id()') IS NULL THEN 'absent' ELSE 'present' END")"
[ "$ctx" = present ] || { echo 'direct_rls_operator=FAIL reason=runtime_context_missing'; exit 12; }
core="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_direct_conversation','get_my_direct_conversations','get_direct_native_messages','start_or_get_direct_conversation','send_direct_native_message','start_direct_conversation_with_message','accept_direct_message_request','delete_direct_message_v2','get_direct_conversation_messages','ignore_direct_message_request','mark_direct_conversation_read_v2','send_direct_message','send_direct_voice_message','set_direct_typing_state_v2','toggle_direct_message_reaction_v2') AND pg_get_functiondef(p.oid) LIKE '%teswa_runtime.current_user_id()%'")"
[ "$core" = 15 ] || { echo "direct_rls_operator=FAIL reason=direct_rpc_runtime_not_green count=$core"; exit 13; }
python3 - "$OBJ" "$DIR/direct-rls.tar.gz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$DIR/direct-rls.tar.gz" | sha256sum -c - >/dev/null
tar -xzf "$DIR/direct-rls.tar.gz" -C "$DIR"
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/runtime-direct-messaging-rls.sql"
echo 'direct_rls_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/verify-runtime-direct-messaging-rls.sql"
bad="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'direct_%select_participant%' AND coalesce(qual,'') LIKE '%auth.uid()%'")"
[ "$bad" = 0 ] || { echo "direct_rls_operator=FAIL reason=auth_uid_policy_remaining count=$bad"; exit 14; }
echo 'direct_rls_auth_uid_remaining=0'
echo 'direct_rls_semantic_rehearsal=PASS'
echo 'direct_rls_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"; SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"; echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'direct_rls_operator=FAIL reason=run_command_text_limit' >&2; exit 5; }
python3 - "$CONTENT_FILE" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET_FILE" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT_FILE" --target "file://$TARGET_FILE" --timeout-in-seconds 300 --display-name 'teswa-lane4-direct-messaging-rls' --query 'data.id' --raw-output)"
echo "command_id=$CID"
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"
  case "$S" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'; [ "$S" = SUCCEEDED ] || exit 6; break;; esac
  sleep 3
done
oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null; UPLOADED=false
echo 'direct_rls_artifact_cleanup=PASS'
echo 'direct_rls_operator_cloudshell=PASS'
