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
  [ -f "$f" ] || { echo "auth_foundation_v2=FAIL reason=missing_repo_asset path=$f" >&2; exit 2; }
done

WORK="$(mktemp -d)"
ARCHIVE="$WORK/auth-foundation-v2.tar.gz"
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
OBJECT="lane4-rehearsal/auth-foundation-v2/$(date -u +%Y%m%dT%H%M%SZ)-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'auth_foundation_v2=FAIL reason=core_instance_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'auth_foundation_v2=FAIL reason=target_not_running'; exit 4; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true
rm -f "$ARCHIVE"
echo 'auth_foundation_v2_artifact_upload=PASS'
echo 'auth_foundation_v2_mutation_scope=OCI_REHEARSAL_ONLY'
echo 'supabase_mutation=none'
echo 'production_cutover=none'

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; D="$(mktemp -d /var/tmp/teswa-auth-foundation-v2-XXXXXX)"; trap 'rm -rf "$D"' EXIT
P=/usr/pgsql-17/bin/psql; DB=teswa_rehearsal
sudo -n true || { echo 'auth_foundation_v2=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_foundation_v2=FAIL reason=unexpected_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'auth_foundation_v2=FAIL reason=postgres_inactive'; exit 12; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys,os
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content); os.chmod(sys.argv[2],0o600)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz" | sha256sum -c - >/dev/null || { echo 'auth_foundation_v2=FAIL reason=artifact_sha'; exit 13; }
tar -xzf "$D/a.tgz" -C "$D"; rm -f "$D/a.tgz"

IDENTITY="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.users" 2>/dev/null || echo MISSING)"
[ "$IDENTITY" = 32 ] || { echo "auth_foundation_v2=FAIL reason=identity_anchor_state value=$IDENTITY"; exit 14; }
echo "identity_users=$IDENTITY"

apply_sql() {
  local label="$1" file="$2" log="$3"
  if ! sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$file" >"$log" 2>&1; then
    echo "${label}=FAIL"
    tail -n 80 "$log" || true
    exit 20
  fi
  echo "${label}=PASS"
}

# Reapply both foundations deliberately. They are idempotent and this repairs
# partial/stale rehearsal state without touching Supabase or production traffic.
apply_sql auth_session_foundation_v2 "$D/runtime-auth-session-foundation.sql" "$D/session.log"
apply_sql auth_email_foundation_v2 "$D/runtime-auth-email-foundation.sql" "$D/email.log"

sudo -u postgres "$P" -d "$DB" -Atqc "
SELECT 'catalog_identity_users='||count(*) FROM teswa_identity.users;
SELECT 'catalog_sessions='||count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='teswa_auth' AND c.relname='sessions' AND c.relkind IN ('r','p');
SELECT 'catalog_email_accounts='||count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='teswa_auth' AND c.relname='email_accounts' AND c.relkind IN ('r','p');
SELECT 'catalog_confirmation_tokens='||count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='teswa_auth' AND c.relname='email_confirmation_tokens' AND c.relkind IN ('r','p');
SELECT 'catalog_create_session_fn='||count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='teswa_auth' AND p.proname='create_session';
SELECT 'catalog_verify_email_password_fn='||count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='teswa_auth' AND p.proname='verify_email_password';
" > "$D/catalog.txt"
cat "$D/catalog.txt"

python3 - "$D/catalog.txt" <<'PY'
import sys
vals={}
for line in open(sys.argv[1],encoding='utf-8'):
    line=line.strip()
    if '=' in line:
        k,v=line.split('=',1); vals[k]=int(v)
need={
 'catalog_identity_users':32,
 'catalog_sessions':1,
 'catalog_email_accounts':1,
 'catalog_confirmation_tokens':1,
 'catalog_create_session_fn':1,
 'catalog_verify_email_password_fn':1,
}
bad={k:(vals.get(k),v) for k,v in need.items() if vals.get(k)!=v}
if bad:
    print('auth_foundation_v2=FAIL reason=post_repair_catalog_guard details='+repr(bad))
    raise SystemExit(21)
print('auth_foundation_v2_post_repair_catalog_guard=PASS')
PY

echo 'auth_foundation_v2_guest=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'auth_foundation_v2=FAIL reason=run_command_text_limit'; exit 5; }

python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name 'teswa-auth-foundation-v2' --query 'data.id' --raw-output)"
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
echo 'auth_foundation_v2_artifact_cleanup=PASS'
[ "$FINAL_STATE" = SUCCEEDED ] || { echo "auth_foundation_v2=FAIL state=$FINAL_STATE"; exit 6; }

echo 'auth_foundation_v2_cloudshell=PASS'
echo 'continuing_to_auth_email_runtime=true'
bash "$NEXT"
echo 'auth_email_resume_v2_full_operator=PASS'
