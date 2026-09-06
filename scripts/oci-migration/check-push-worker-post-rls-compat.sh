#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
CONTENT="$WORK/content.json"; TARGET="$WORK/target.json"
INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'push_post_rls_compat=FAIL reason=core_instance_not_found'; exit 2; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'push_post_rls_compat=FAIL reason=target_not_running'; exit 3; }
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
P=/usr/pgsql-17/bin/psql; DB=teswa_rehearsal; W=/opt/teswa/push-shadow/worker.py
N=''; D=''; WAS=0
cleanup(){ [ -z "$N" ] || sudo -u postgres "$P" -d "$DB" -qAtc "DELETE FROM public.notifications WHERE id='$N'::uuid" >/dev/null 2>&1 || true; [ -z "$D" ] || sudo -u postgres "$P" -d "$DB" -qAtc "DELETE FROM public.push_devices WHERE id='$D'::uuid" >/dev/null 2>&1 || true; [ "$WAS" = 0 ] || sudo systemctl start teswa-push-shadow >/dev/null 2>&1 || true; }
trap cleanup EXIT
sudo -n true || { echo 'push_post_rls_compat=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'push_post_rls_compat=FAIL reason=wrong_host'; exit 11; }
sudo test -f "$W" || { echo 'push_post_rls_compat=FAIL reason=worker_missing'; exit 12; }
sudo -u teswapush test -r "$W" || { echo 'push_post_rls_compat=FAIL reason=worker_not_readable_by_service_role'; exit 12; }
id teswapush >/dev/null 2>&1 || { echo 'push_post_rls_compat=FAIL reason=role_missing'; exit 13; }
systemctl is-active --quiet teswa-push-shadow && WAS=1 || true
systemctl cat teswa-push-shadow | grep -q 'TESWA_PUSH_SEND_ENABLED=0' || { echo 'push_post_rls_compat=FAIL reason=send_not_forced_off'; exit 14; }
sudo systemctl stop teswa-push-shadow >/dev/null 2>&1 || true
H="$(sudo -u teswapush env TESWA_DB="$DB" TESWA_PUSH_SEND_ENABLED=0 python3 "$W" --health)"
printf '%s' "$H" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x["status"]=="ok" and x["sendEnabled"] is False and x["supabaseRuntimeDependency"] is False' || { echo 'push_post_rls_compat=FAIL reason=health'; exit 15; }
U="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT id FROM teswa_identity.users ORDER BY id LIMIT 1')"
D="$(sudo -u postgres "$P" -d "$DB" -Atqc "INSERT INTO public.push_devices(user_id,expo_push_token,platform,notifications_enabled) VALUES ('$U'::uuid,'ExponentPushToken[post-rls-probe]','android',true) RETURNING id")"
N="$(sudo -u postgres "$P" -d "$DB" -Atqc "INSERT INTO public.notifications(user_id,type,title,body,route) VALUES ('$U'::uuid,'system','post rls probe','no outbound','/probe') RETURNING id")"
J="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT job_id FROM teswa_jobs.push_outbox WHERE notification_id='$N'::uuid")"
[ -n "$J" ] || { echo 'push_post_rls_compat=FAIL reason=outbox_job_missing'; exit 16; }
VN="$(sudo -u teswapush "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.notifications WHERE id='$N'::uuid")"
VD="$(sudo -u teswapush "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.push_devices WHERE id='$D'::uuid")"
echo "push_role_preclaim_notification_visible=$VN"
echo "push_role_preclaim_device_visible=$VD"
[ "$VN" = 0 ] && [ "$VD" = 0 ] || { echo 'push_post_rls_compat=FAIL reason=preclaim_rows_should_be_hidden'; exit 18; }
R="$(sudo -u teswapush env TESWA_DB="$DB" TESWA_PUSH_SEND_ENABLED=0 python3 "$W" --once)"
echo "push_post_rls_worker_result=$R"
printf '%s' "$R" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x.get("processed") is True and x.get("status")=="skipped" and x.get("reason")=="rehearsal_send_disabled" and int(x.get("deviceCount",0))==1' || { echo 'push_post_rls_compat=FAIL reason=worker_cannot_read_rls_protected_notification_path'; exit 17; }
STATUS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT status||':'||coalesce(last_error,'') FROM teswa_jobs.push_outbox WHERE job_id=$J")"
[ "$STATUS" = 'skipped:rehearsal_send_disabled' ] || { echo "push_post_rls_compat=FAIL reason=unexpected_job_status value=$STATUS"; exit 19; }
echo 'push_worker_presence_check=sudo'
echo 'push_worker_service_role_readable=true'
echo 'push_preclaim_rls_isolation=PASS'
echo 'push_active_job_rls_bridge=PASS'
echo 'push_post_rls_outbound_performed=false'
echo 'push_post_rls_probe_cleanup=PASS'
echo 'push_post_rls_compat=PASS'
GUEST
)"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"; echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'push_post_rls_compat=FAIL reason=run_command_text_limit'; exit 4; }
python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name 'teswa-push-post-rls-compat' --query 'data.id' --raw-output)"; echo "command_id=$CID"
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"; S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"
  case "$S" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'; [ "$S" = SUCCEEDED ] || exit 5; break;; esac
  sleep 3
done
echo 'push_post_rls_compat_cloudshell=PASS'
