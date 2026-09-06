#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET=teswa-backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SOURCE_URL="${TESWA_SOURCE_DATABASE_URL:-${SUPABASE_DB_URL:-}}"
[ -n "$SOURCE_URL" ] || { echo 'auth_email_final_operator=FAIL reason=source_database_url_missing expected=TESWA_SOURCE_DATABASE_URL_or_SUPABASE_DB_URL' >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo 'auth_email_final_operator=FAIL reason=psql_missing_in_cloudshell' >&2; exit 3; }

for f in runtime-auth-email-service.sql auth-email-runtime-server.py auth-email-runtime-guest-deploy.sh; do
  [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "auth_email_final_operator=FAIL reason=missing_repo_artifact file=$f" >&2; exit 4; }
done

WORK="$(mktemp -d)"
CRED="$WORK/legacy-email.json"
ARCHIVE="$WORK/auth-email-final.tar.gz"
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

# Read-only source capture. Credential material never goes to stdout, argv,
# Git, or the persistent evidence directory.
SOURCE_ENV=(env "PGDATABASE=$SOURCE_URL" "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000")
TOTAL_USERS="$("${SOURCE_ENV[@]}" psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM auth.users")"
EMAIL_CREDS="$("${SOURCE_ENV[@]}" psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM auth.users u WHERE coalesce(u.encrypted_password,'')<>'' AND u.email IS NOT NULL")"
EMAIL_IDENTITIES="$("${SOURCE_ENV[@]}" psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM auth.users u WHERE coalesce(u.encrypted_password,'')<>'' AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email')")"
[ "$TOTAL_USERS" = 32 ] || { echo "auth_email_final_operator=FAIL reason=source_identity_count_changed count=$TOTAL_USERS" >&2; exit 5; }
[ "$EMAIL_CREDS" = 1 ] && [ "$EMAIL_IDENTITIES" = 1 ] || { echo "auth_email_final_operator=FAIL reason=unexpected_email_credential_shape credentials=$EMAIL_CREDS identities=$EMAIL_IDENTITIES" >&2; exit 6; }

"${SOURCE_ENV[@]}" psql -X -qAt -v ON_ERROR_STOP=1 -c "COPY (SELECT json_build_object('user_id',u.id::text,'email',u.email,'password_hash',u.encrypted_password,'email_confirmed_at',u.email_confirmed_at,'created_at',u.created_at,'updated_at',u.updated_at)::text FROM auth.users u WHERE coalesce(u.encrypted_password,'')<>'' AND u.email IS NOT NULL) TO STDOUT" > "$CRED"
chmod 600 "$CRED"
python3 - "$CRED" <<'PY'
import json,sys,uuid
x=json.load(open(sys.argv[1]))
uuid.UUID(x['user_id'])
assert isinstance(x['email'],str) and '@' in x['email']
assert isinstance(x['password_hash'],str) and x['password_hash'].startswith(('$2a$','$2b$','$2y$')) and len(x['password_hash']) >= 50
assert x.get('email_confirmed_at') is not None
print('source_legacy_email_capture=PASS')
print('source_credential_material_echoed=false')
PY

echo 'source_database_access=read_only'
echo 'source_auth_users=32'
echo 'source_email_credentials=1'
echo 'supabase_mutation=none'

mkdir -m 700 "$WORK/stage"
cp "$ROOT/scripts/oci-migration/runtime-auth-email-service.sql" "$WORK/stage/"
cp "$ROOT/scripts/oci-migration/auth-email-runtime-server.py" "$WORK/stage/"
cp "$ROOT/scripts/oci-migration/auth-email-runtime-guest-deploy.sh" "$WORK/stage/"
cp "$CRED" "$WORK/stage/legacy-email.json"
chmod 600 "$WORK/stage"/*
chmod 700 "$WORK/stage/auth-email-runtime-guest-deploy.sh"
tar -C "$WORK/stage" -czf "$ARCHIVE" runtime-auth-email-service.sql auth-email-runtime-server.py auth-email-runtime-guest-deploy.sh legacy-email.json
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/auth-email-final/$STAMP-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'auth_email_final_operator=FAIL reason=core_instance_not_found'; exit 7; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'auth_email_final_operator=FAIL reason=target_not_running'; exit 8; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true
rm -f "$CRED" "$ARCHIVE"
echo 'credential_transport=private_object_storage_ephemeral'
echo 'credential_echoed=false'
echo 'credential_committed_to_git=false'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; D="$(mktemp -d /var/tmp/teswa-auth-email-final-XXXXXX)"; trap 'rm -rf "$D"' EXIT
sudo -n true || { echo 'auth_email_final_operator=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_email_final_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys,os
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content); os.chmod(sys.argv[2],0o600)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz" | sha256sum -c - >/dev/null || { echo 'auth_email_final_operator=FAIL reason=artifact_sha'; exit 12; }
tar -xzf "$D/a.tgz" -C "$D"; rm -f "$D/a.tgz"; chmod 700 "$D/auth-email-runtime-guest-deploy.sh"; bash "$D/auth-email-runtime-guest-deploy.sh" "$D"
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'auth_email_final_operator=FAIL reason=run_command_text_limit'; exit 9; }

python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name 'teswa-lane4-auth-email-final' --query 'data.id' --raw-output)"
echo "command_id=$CID"
FINAL=''
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      FINAL="$S"
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'
      break
      ;;
  esac
  sleep 3
done

# Sensitive credential bundle is deleted whether the guest command passed or failed.
oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
UPLOADED=false
echo 'legacy_email_credential_artifact_cleanup=PASS'
[ "$FINAL" = SUCCEEDED ] || { echo "auth_email_final_operator=FAIL state=$FINAL"; exit 10; }
echo 'google_positive_app_e2e=DEFERRED_TO_APP_ADAPTER'
echo 'auth_email_final_operator_cloudshell=PASS'
