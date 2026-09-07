#!/usr/bin/env bash
set -Eeuo pipefail

# Cloud Shell orchestrator for the first real Oracle-side auth runtime shadow.
# It deploys only teswa-auth-shadow on loopback:3110. It does not modify
# Supabase, PostgreSQL, teswa-api, DNS, Caddy, firewall rules, or prod traffic.

export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_ROOT="${TESWA_MIGRATION_EVIDENCE_ROOT:-$HOME/teswa-migration-evidence}"
IDENTITY_MAP="${TESWA_IDENTITY_MAP:-$EVIDENCE_ROOT/identity-20260906/input/identity-map.json}"
SERVER="$ROOT/scripts/oci-migration/auth-google-shadow-server.py"
GUEST="$ROOT/scripts/oci-migration/auth-google-shadow-guest-deploy.sh"
BUCKET=teswa-backups

for f in "$IDENTITY_MAP" "$SERVER" "$GUEST" "$ROOT/google-services.json"; do
  [ -f "$f" ] || { echo "auth_google_shadow_operator=FAIL reason=missing_file path=$f" >&2; exit 2; }
done

CLIENT_ID="$(python3 - "$ROOT/google-services.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); ids=[]
for client in x.get('client',[]):
    for row in client.get('oauth_client',[]):
        if row.get('client_type') == 3 and row.get('client_id'):
            ids.append(row['client_id'])
ids=sorted(set(ids)); assert len(ids)==1
print(ids[0])
PY
)"
python3 - "$IDENTITY_MAP" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x.get('credential_material_included') is False
assert len(x.get('users') or []) == 32
assert len(x.get('identities') or []) == 32
print('identity_input_guard=PASS')
PY

echo "google_web_client_id_present=true"
echo "database_mutation=none"
echo "supabase_mutation=none"
echo "teswa_api_mutation=none"
echo "production_cutover=none"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'auth_google_shadow_operator=FAIL reason=core_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || { echo 'auth_google_shadow_operator=FAIL reason=wrong_target'; exit 4; }
echo "control_plane_target=$LIVE_NAME"
echo "control_plane_state=$LIVE_STATE"

STAGE="$(mktemp -d)"; ARCHIVE="$(mktemp --suffix=.tar.gz)"; C="$(mktemp)"; T="$(mktemp)"
cleanup() { rm -rf "$STAGE" "$ARCHIVE" "$C" "$T"; }
trap cleanup EXIT
cp "$SERVER" "$STAGE/server.py"
cp "$GUEST" "$STAGE/auth-google-shadow-guest-deploy.sh"
cp "$IDENTITY_MAP" "$STAGE/identity-map.json"
python3 - "$STAGE/config.json" "$CLIENT_ID" <<'PY'
import json,sys
json.dump({'format_version':1,'google_web_client_id':sys.argv[2],'production_traffic':False,'listen':'127.0.0.1:3110'},open(sys.argv[1],'w'),indent=2)
PY
chmod 600 "$STAGE"/*
tar -C "$STAGE" -czf "$ARCHIVE" .
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/auth-google-shadow/${SHA}.tar.gz"
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
echo "auth_shadow_artifact_upload=PASS"
echo "auth_shadow_artifact_sha256=$SHA"

BOOT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; DIR=/var/tmp/teswa-auth-shadow-${SHA:0:12}
rm -rf "$DIR" "$DIR.tgz"; mkdir -m 700 "$DIR"
python3 - "$OBJ" "$DIR.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
print('auth_shadow_artifact_download=PASS')
PY
printf '%s  %s\n' "$SHA" "$DIR.tgz" | sha256sum -c - >/dev/null
tar -C "$DIR" -xzf "$DIR.tgz"; rm -f "$DIR.tgz"
bash "$DIR/auth-google-shadow-guest-deploy.sh" "$DIR"
rm -rf "$DIR"
GUEST
)"
BOOT="${BOOT//__OBJECT__/$OBJECT}"; BOOT="${BOOT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$BOOT" | wc -c | tr -d ' ')"
echo "guest_bootstrap_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'auth_google_shadow_operator=FAIL reason=run_command_text_limit'; exit 5; }
python3 - "$C" "$BOOT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$T" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$C" --target "file://$T" \
  --timeout-in-seconds 600 --display-name teswa-lane4-auth-google-shadow-deploy --query 'data.id' --raw-output)"
echo "command_id=$CID"
FINAL=''
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      FINAL="$S"
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text", ""));print(c.get("message", ""))'
      break;;
  esac
  sleep 3
done
if [ "$FINAL" = SUCCEEDED ]; then
  oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null || true
  echo "auth_shadow_artifact_cleanup=PASS"
  echo "auth_google_shadow_operator=PASS"
else
  echo "auth_shadow_artifact_retained_for_diagnosis=$OBJECT" >&2
  exit 6
fi
