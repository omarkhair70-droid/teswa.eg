#!/usr/bin/env bash
set -Eeuo pipefail

# Cloud Shell operator for Lane 4 realtime transport rehearsal.
# Uploads a private artifact, deploys a loopback-only service on teswa-core-01,
# verifies auth/catch-up semantics, then deletes the deployment artifact.

export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET=teswa-backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/realtime-transport.tar.gz"
CONTENT_FILE="$WORK/content.json"
TARGET_FILE="$WORK/target.json"
UPLOADED=false

cleanup(){
  rm -rf "$WORK"
  if [ "$UPLOADED" = true ]; then
    oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for f in realtime-shadow-transport.py realtime-shadow-guest-deploy.sh; do
  [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "realtime_transport_operator=FAIL reason=missing_$f" >&2; exit 2; }
done

mkdir -p "$WORK/stage"
cp "$ROOT/scripts/oci-migration/realtime-shadow-transport.py" "$WORK/stage/server.py"
cp "$ROOT/scripts/oci-migration/realtime-shadow-guest-deploy.sh" "$WORK/stage/guest-deploy.sh"
chmod 700 "$WORK/stage/guest-deploy.sh"
tar -C "$WORK/stage" -czf "$ARCHIVE" server.py guest-deploy.sh
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/realtime-transport/$STAMP-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'realtime_transport_operator=FAIL reason=core_instance_not_found' >&2; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || { echo 'realtime_transport_operator=FAIL reason=target_not_running' >&2; exit 4; }

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true

echo 'TESWA LANE 4 REALTIME SHADOW TRANSPORT OPERATOR'
echo "target=$LIVE_NAME"
echo 'database=teswa_rehearsal'
echo 'listen_target=127.0.0.1:3120'
echo 'transport=durable_outbox_long_poll'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo "artifact_sha256=$SHA"

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'
DIR="$(mktemp -d /var/tmp/teswa-rt-transport-XXXXXX)"; trap 'rm -rf "$DIR"' EXIT
sudo -n true || { echo 'realtime_transport_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'realtime_transport_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
python3 - "$OBJ" "$DIR/bundle.tar.gz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$DIR/bundle.tar.gz" | sha256sum -c - >/dev/null || { echo 'realtime_transport_operator=FAIL reason=artifact_sha_mismatch'; exit 12; }
tar -xzf "$DIR/bundle.tar.gz" -C "$DIR"
chmod 700 "$DIR/guest-deploy.sh"
bash "$DIR/guest-deploy.sh" "$DIR"
echo 'realtime_transport_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'realtime_transport_operator=FAIL reason=run_command_text_limit' >&2; exit 5; }

python3 - "$CONTENT_FILE" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET_FILE" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT_FILE" --target "file://$TARGET_FILE" --timeout-in-seconds 300 --display-name 'teswa-lane4-realtime-shadow-transport' --query 'data.id' --raw-output)"
echo "command_id=$CID"
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'
      [ "$S" = SUCCEEDED ] || exit 6
      break
      ;;
  esac
  sleep 3
done

oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null
UPLOADED=false
echo 'realtime_transport_artifact_cleanup=PASS'
echo 'realtime_transport_operator_cloudshell=PASS'
