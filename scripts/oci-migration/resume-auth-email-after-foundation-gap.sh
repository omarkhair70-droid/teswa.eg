#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET=teswa-backups
SESSION_SQL="$ROOT/scripts/oci-migration/runtime-auth-session-foundation.sql"
EMAIL_SQL="$ROOT/scripts/oci-migration/runtime-auth-email-foundation.sql"
NEXT="$ROOT/scripts/oci-migration/deploy-auth-email-runtime-and-legacy-live-source.sh"

for f in "$SESSION_SQL" "$EMAIL_SQL" "$NEXT"; do
  [ -f "$f" ] || { echo "auth_foundation_resume=FAIL reason=missing_repo_asset path=$f" >&2; exit 2; }
done

WORK="$(mktemp -d)"
ARCHIVE="$WORK/auth-foundation-resume.tar.gz"
CONTENT="$WORK/content.json"
TARGET="$WORK/target.json"
UPLOADED=false
OBJECT=""
cleanup() {
  rm -rf "$WORK"
  if [ "$UPLOADED" = true ] && [ -n "$OBJECT" ]; then
    oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -m 700 "$WORK/stage"
cp "$SESSION_SQL" "$WORK/stage/runtime-auth-session-foundation.sql"
cp "$EMAIL_SQL" "$WORK/stage/runtime-auth-email-foundation.sql"
chmod 600 "$WORK/stage"/*
tar -C "$WORK/stage" -czf "$ARCHIVE" runtime-auth-session-foundation.sql runtime-auth-email-foundation.sql
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/auth-foundation-resume/$(date -u +%Y%m%dT%H%M%SZ)-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'auth_foundation_resume=FAIL reason=core_instance_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'auth_foundation_resume=FAIL reason=target_not_running'; exit 4; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true
rm -f "$ARCHIVE"
echo 'auth_foundation_resume_artifact_upload=PASS'

echo 'auth_foundation_resume_mutation_scope=OCI_REHEARSAL_ONLY'
echo 'supabase_mutation=none'
echo 'production_cutover=none'

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; D="$(mktemp -d /var/tmp/teswa-auth-foundation-resume-XXXXXX)"; trap 'rm -rf "$D"' EXIT
P=/usr/pgsql-17/bin/psql; DB=teswa_rehearsal
sudo -n true || { echo 'auth_foundation_resume=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_foundation_resume=FAIL reason=unexpected_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'auth_foundation_resume=FAIL reason=postgres_inactive'; exit 12; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys,os
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content); os.chmod(sys.argv[2],0o600)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz" | sha256sum -c - >/dev/null || { echo 'auth_foundation_resume=FAIL reason=artifact_sha'; exit 13; }
tar -xzf "$D/a.tgz" -C "$D"; rm -f "$D/a.tgz"
IDENTITY="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.users" 2>/dev/null || echo MISSING)"
[ "$IDENTITY" = 32 ] || { echo "auth_foundation_resume=FAIL reason=identity_anchor_state value=$IDENTITY"; exit 14; }
SESS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_auth.sessions') IS NOT NULL)::text")"
EMAIL="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_auth.email_accounts') IS NOT NULL)::text")"
echo "identity_users=$IDENTITY"
echo "sessions_present_before=$SESS"
echo "email_accounts_present_before=$EMAIL"
if [ "$SESS" != t ]; then
  sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/runtime-auth-session-foundation.sql"
  echo 'auth_session_foundation_repair=PASS'
else
  echo 'auth_session_foundation_repair=SKIP_ALREADY_PRESENT'
fi
if [ "$EMAIL" != t ]; then
  sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$D/runtime-auth-email-foundation.sql"
  echo 'auth_email_foundation_repair=PASS'
else
  echo 'auth_email_foundation_repair=SKIP_ALREADY_PRESENT'
fi
FINAL="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_identity.users') IS NOT NULL AND to_regclass('teswa_auth.sessions') IS NOT NULL AND to_regclass('teswa_auth.email_accounts') IS NOT NULL)::text")"
[ "$FINAL" = t ] || { echo 'auth_foundation_resume=FAIL reason=post_repair_guard'; exit 15; }
echo 'auth_foundation_post_repair_guard=PASS'
echo 'auth_foundation_resume=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'auth_foundation_resume=FAIL reason=run_command_text_limit'; exit 5; }

python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name 'teswa-auth-foundation-resume' --query 'data.id' --raw-output)"
echo "command_id=$CID"
FINAL_STATE=''
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      FINAL_STATE="$S"
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'
      break
      ;;
  esac
  sleep 3
done

oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
UPLOADED=false
echo 'auth_foundation_resume_artifact_cleanup=PASS'
[ "$FINAL_STATE" = SUCCEEDED ] || { echo "auth_foundation_resume=FAIL state=$FINAL_STATE"; exit 6; }

echo 'auth_foundation_resume_cloudshell=PASS'
echo 'continuing_to_auth_email_runtime=true'
bash "$NEXT"
echo 'auth_email_resume_full_operator=PASS'
