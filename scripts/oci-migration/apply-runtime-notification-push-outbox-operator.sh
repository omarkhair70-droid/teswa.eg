#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"; umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; BUCKET=teswa-backups; STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"; ARCHIVE="$WORK/push-outbox.tar.gz"; CONTENT="$WORK/content.json"; TARGET="$WORK/target.json"; UPLOADED=false
cleanup(){ rm -rf "$WORK"; if [ "$UPLOADED" = true ]; then oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true; fi; }; trap cleanup EXIT
for f in runtime-notification-push-outbox.sql verify-runtime-notification-push-outbox.sql; do [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "push_outbox_operator=FAIL reason=missing_$f"; exit 2; }; done
cp "$ROOT/scripts/oci-migration/runtime-notification-push-outbox.sql" "$WORK/"; cp "$ROOT/scripts/oci-migration/verify-runtime-notification-push-outbox.sql" "$WORK/"
tar -C "$WORK" -czf "$ARCHIVE" runtime-notification-push-outbox.sql verify-runtime-notification-push-outbox.sql
SHA="$(sha256sum "$ARCHIVE"|awk '{print $1}')"; OBJECT="lane4-rehearsal/push-outbox/$STAMP-$SHA.tar.gz"
INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"; [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'push_outbox_operator=FAIL reason=core_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"; STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"; [ "$STATE" = RUNNING ] || { echo 'push_outbox_operator=FAIL reason=core_not_running'; exit 4; }
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null; UPLOADED=true
echo 'TESWA LANE 4 NOTIFICATION PUSH OUTBOX OPERATOR'; echo 'target=teswa-core-01'; echo 'database=teswa_rehearsal'; echo 'outbound_push=disabled'; echo 'supabase_mutation=none'; echo 'production_cutover=none'; echo "artifact_sha256=$SHA"
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; DB=teswa_rehearsal; P=/usr/pgsql-17/bin/psql; D="$(mktemp -d /var/tmp/teswa-push-outbox-XXXXXX)"; trap 'rm -rf "$D"' EXIT
sudo -n true || { echo 'push_outbox_operator=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'push_outbox_operator=FAIL reason=wrong_host'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'push_outbox_operator=FAIL reason=postgres_inactive'; exit 12; }
systemctl is-active --quiet teswa-realtime-shadow || { echo 'push_outbox_operator=FAIL reason=realtime_not_green'; exit 13; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); n=c.get_namespace().data; r=c.get_object(n,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz"|sha256sum -c - >/dev/null || { echo 'push_outbox_operator=FAIL reason=sha'; exit 14; }; tar -xzf "$D/a.tgz" -C "$D"
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/runtime-notification-push-outbox.sql"; echo 'notification_push_outbox_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/verify-runtime-notification-push-outbox.sql"
tr="$(sudo -u postgres "$P" -d "$DB" -Atqc "select count(*) from pg_trigger where not tgisinternal and tgname='teswa_push_outbox_capture'")"; [ "$tr" = 1 ] || { echo "push_outbox_operator=FAIL reason=trigger_count count=$tr"; exit 15; }
echo 'outbound_push_performed=false'; echo 'notification_push_outbox_semantics=PASS'; echo 'push_outbox_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"; SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"; BYTES="$(printf '%s' "$SCRIPT_TEXT"|wc -c|tr -d ' ')"; echo "guest_script_bytes=$BYTES"; [ "$BYTES" -le 4096 ] || { echo 'push_outbox_operator=FAIL reason=run_command_limit'; exit 5; }
python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name teswa-lane4-push-outbox --query 'data.id' --raw-output)"; echo "command_id=$CID"
while true; do J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"; S="$(printf '%s' "$J"|python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"; case "$S" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) printf '%s' "$J"|python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'; [ "$S" = SUCCEEDED ] || exit 6; break;; esac; sleep 3; done
oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null; UPLOADED=false; echo 'push_outbox_artifact_cleanup=PASS'; echo 'push_outbox_operator_cloudshell=PASS'
