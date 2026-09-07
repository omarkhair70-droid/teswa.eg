#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"; umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; BUCKET=teswa-backups; STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"; ARCHIVE="$WORK/realtime-outbox.tar.gz"; CONTENT_FILE="$WORK/content.json"; TARGET_FILE="$WORK/target.json"; UPLOADED=false
cleanup(){ rm -rf "$WORK"; if [ "$UPLOADED" = true ]; then oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true; fi; }; trap cleanup EXIT
for f in runtime-realtime-outbox.sql verify-runtime-realtime-outbox.sql; do [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "realtime_operator=FAIL reason=missing_$f"; exit 2; }; done
cp "$ROOT/scripts/oci-migration/runtime-realtime-outbox.sql" "$WORK/"; cp "$ROOT/scripts/oci-migration/verify-runtime-realtime-outbox.sql" "$WORK/"
tar -C "$WORK" -czf "$ARCHIVE" runtime-realtime-outbox.sql verify-runtime-realtime-outbox.sql
SHA="$(sha256sum "$ARCHIVE"|awk '{print $1}')"; OBJECT="lane4-rehearsal/realtime-outbox/$STAMP-$SHA.tar.gz"
INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'realtime_operator=FAIL reason=core_instance_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"; STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'realtime_operator=FAIL reason=target_not_running'; exit 4; }
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null; UPLOADED=true
echo 'TESWA LANE 4 REALTIME OUTBOX OPERATOR'; echo 'target=teswa-core-01'; echo 'database=teswa_rehearsal'; echo 'source_realtime_tables=6'; echo 'supabase_mutation=none'; echo 'production_cutover=none'; echo "artifact_sha256=$SHA"
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; DB=teswa_rehearsal; P=/usr/pgsql-17/bin/psql; D="$(mktemp -d /var/tmp/teswa-realtime-XXXXXX)"; trap 'rm -rf "$D"' EXIT
sudo -n true || { echo 'realtime_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
systemctl is-active --quiet postgresql-17 || { echo 'realtime_operator=FAIL reason=postgres_inactive'; exit 11; }
role="$(sudo -u postgres "$P" -d "$DB" -Atqc "select count(*) from pg_roles where rolname='teswa_app_authenticated' and not rolcanlogin and not rolbypassrls")"; [ "$role" = 1 ] || { echo 'realtime_operator=FAIL reason=app_role_not_green'; exit 12; }
rls="$(sudo -u postgres "$P" -d "$DB" -Atqc "select count(*) from pg_policies where schemaname='public' and policyname in ('direct_conversations_select_participant','direct_messages_select_participant','direct_message_attachments_select_participants','direct_message_reactions_select_participants','direct_typing_state_select_participants') and coalesce(qual,'') like '%teswa_runtime.current_user_id()%'")"; [ "$rls" = 5 ] || { echo "realtime_operator=FAIL reason=direct_rls_not_green count=$rls"; exit 13; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); n=c.get_namespace().data; r=c.get_object(n,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz"|sha256sum -c - >/dev/null; tar -xzf "$D/a.tgz" -C "$D"
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/runtime-realtime-outbox.sql"; echo 'realtime_outbox_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/verify-runtime-realtime-outbox.sql"
triggers="$(sudo -u postgres "$P" -d "$DB" -Atqc "select count(*) from pg_trigger where not tgisinternal and tgname='teswa_realtime_capture_change'")"; [ "$triggers" = 6 ] || { echo "realtime_operator=FAIL reason=trigger_count count=$triggers"; exit 14; }
pub="$(sudo -u postgres "$P" -d "$DB" -Atqc "select has_function_privilege('public','teswa_realtime.read_events(bigint,integer)','EXECUTE')")"; [ "$pub" = f ] || { echo 'realtime_operator=FAIL reason=public_realtime_execute'; exit 15; }
echo 'realtime_semantic_rehearsal=PASS'; echo 'realtime_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"; SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"; BYTES="$(printf '%s' "$SCRIPT_TEXT"|wc -c|tr -d ' ')"; echo "guest_script_bytes=$BYTES"; [ "$BYTES" -le 4096 ] || { echo 'realtime_operator=FAIL reason=run_command_text_limit'; exit 5; }
python3 - "$CONTENT_FILE" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET_FILE" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT_FILE" --target "file://$TARGET_FILE" --timeout-in-seconds 300 --display-name teswa-lane4-realtime-outbox --query 'data.id' --raw-output)"; echo "command_id=$CID"
while true; do J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"; S="$(printf '%s' "$J"|python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"; case "$S" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) printf '%s' "$J"|python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'; [ "$S" = SUCCEEDED ] || exit 6; break;; esac; sleep 3; done
oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null; UPLOADED=false; echo 'realtime_artifact_cleanup=PASS'; echo 'realtime_operator_cloudshell=PASS'
