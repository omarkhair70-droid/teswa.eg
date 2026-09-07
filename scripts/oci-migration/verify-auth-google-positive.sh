#!/usr/bin/env bash
set -Eeuo pipefail

# Positive Google auth verification against the already-deployed local-only
# teswa-auth-shadow service. The Google ID token is read silently in Cloud Shell,
# uploaded only to the private teswa-backups bucket, consumed by teswa-core-01,
# and deleted on both sides. The token, returned Teswa UUID, and shadow session
# token are never printed or committed.

export USER="${USER:-$(id -un)}"
umask 077
BUCKET="teswa-backups"
OBJECT="lane4-auth-positive/$(date -u +%Y%m%dT%H%M%SZ)-$(python3 - <<'PY'
import secrets
print(secrets.token_hex(8))
PY
).json"
TOKEN_FILE="$(mktemp)"
CONTENT_FILE="$(mktemp)"
TARGET_FILE="$(mktemp)"
UPLOADED=false

cleanup() {
  rm -f "$TOKEN_FILE" "$CONTENT_FILE" "$TARGET_FILE"
  if [ "$UPLOADED" = true ]; then
    oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

read -rsp 'Paste mapped Teswa Google ID token (hidden): ' GOOGLE_ID_TOKEN
echo
[ -n "$GOOGLE_ID_TOKEN" ] || { echo 'auth_google_positive=FAIL reason=empty_token' >&2; exit 2; }
python3 - "$GOOGLE_ID_TOKEN" "$TOKEN_FILE" <<'PY'
import json,sys
v=sys.argv[1].strip()
if len(v) < 100 or v.count('.') != 2:
    raise SystemExit('auth_google_positive=FAIL reason=token_shape_invalid')
with open(sys.argv[2],'w',encoding='utf-8') as f:
    json.dump({'id_token':v},f,separators=(',',':'))
PY
unset GOOGLE_ID_TOKEN
chmod 600 "$TOKEN_FILE"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'auth_google_positive=FAIL reason=core_instance_not_found' >&2; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || { echo 'auth_google_positive=FAIL reason=target_not_running' >&2; exit 4; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$TOKEN_FILE" --force >/dev/null
UPLOADED=true
rm -f "$TOKEN_FILE"

echo 'token_transport=private_object_storage_ephemeral'
echo 'token_echoed=false'
echo 'production_cutover=none'
echo 'supabase_mutation=none'
echo 'database_mutation=none'

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'
REQ="$(mktemp)"
RESP="$(mktemp)"
SESS="$(mktemp)"
trap 'rm -f "$REQ" "$RESP" "$SESS"' EXIT

systemctl is-active --quiet teswa-auth-shadow || { echo 'auth_google_positive=FAIL reason=shadow_service_inactive'; exit 10; }
ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3110[[:space:]]' || { echo 'auth_google_positive=FAIL reason=shadow_listener_missing'; exit 11; }

python3 - "$OBJ" "$REQ" <<'PY'
import oci,sys,os
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
os.chmod(sys.argv[2],0o600)
PY

code="$(curl -sS -o "$RESP" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary @"$REQ" http://127.0.0.1:3110/v1/auth/google)"
rm -f "$REQ"
[ "$code" = 200 ] || { echo "auth_google_positive=FAIL reason=google_exchange_http_$code"; exit 12; }

python3 - "$RESP" "$SESS" <<'PY'
import json,sys,os
x=json.load(open(sys.argv[1]))
assert x.get('authenticated') is True
assert x.get('provider') == 'google'
assert x.get('shadow') is True
uid=x.get('user_id'); tok=x.get('session_token')
assert isinstance(uid,str) and uid
assert isinstance(tok,str) and tok.count('.')==2
json.dump({'user_id':uid,'session_token':tok},open(sys.argv[2],'w'),separators=(',',':'))
os.chmod(sys.argv[2],0o600)
PY
rm -f "$RESP"

read -r USER_ID SESSION_TOKEN < <(python3 - "$SESS" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); print(x['user_id'],x['session_token'])
PY
)

code2="$(curl -sS -o "$RESP" -w '%{http_code}' -H "Authorization: Bearer $SESSION_TOKEN" http://127.0.0.1:3110/v1/auth/session)"
[ "$code2" = 200 ] || { echo "auth_google_positive=FAIL reason=session_verify_http_$code2"; exit 13; }
python3 - "$RESP" "$USER_ID" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x.get('authenticated') is True
assert x.get('provider') == 'google'
assert x.get('shadow') is True
assert x.get('user_id') == sys.argv[2]
PY

P=/usr/pgsql-17/bin/psql
present="$(sudo -u postgres "$P" -d teswa_rehearsal -Atqc "SELECT count(*) FROM teswa_identity.users WHERE id = '$USER_ID'::uuid")"
[ "$present" = 1 ] || { echo 'auth_google_positive=FAIL reason=returned_uuid_not_in_identity_anchor'; exit 14; }

unset SESSION_TOKEN USER_ID
rm -f "$SESS" "$RESP"
echo 'google_signature_positive=PASS'
echo 'mapped_existing_teswa_uuid=PASS'
echo 'teswa_shadow_session_issue=PASS'
echo 'teswa_shadow_session_verify=PASS'
echo 'token_echoed=false'
echo 'uuid_echoed=false'
echo 'session_token_echoed=false'
echo 'supabase_runtime_dependency=false'
echo 'auth_google_positive=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
[ "$BYTES" -le 4096 ] || { echo 'auth_google_positive=FAIL reason=run_command_text_limit' >&2; exit 5; }

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
  --timeout-in-seconds 300 --display-name 'teswa-lane4-auth-google-positive' \
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
echo 'positive_token_artifact_cleanup=PASS'
echo 'auth_google_positive_operator=PASS'
