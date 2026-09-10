#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET="teswa-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/runtime-live-discovery-functions.tar.gz"
CONTENT_FILE="$WORK/content.json"
TARGET_FILE="$WORK/target.json"
UPLOADED=false

cleanup() {
  rm -rf "$WORK"
  if [ "$UPLOADED" = true ]; then
    oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for f in runtime-live-discovery-functions.sql verify-runtime-live-discovery-functions.sql; do
  [ -f "$ROOT/scripts/oci-migration/$f" ] || {
    echo "runtime_live_discovery_operator=FAIL reason=missing_$f" >&2
    exit 2
  }
done

cp "$ROOT/scripts/oci-migration/runtime-live-discovery-functions.sql" "$WORK/"
cp "$ROOT/scripts/oci-migration/verify-runtime-live-discovery-functions.sql" "$WORK/"
tar -C "$WORK" -czf "$ARCHIVE" runtime-live-discovery-functions.sql verify-runtime-live-discovery-functions.sql
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/runtime-live-discovery/$STAMP-$SHA.tar.gz"

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo 'runtime_live_discovery_operator=FAIL reason=core_instance_not_found' >&2
  exit 3
}

COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = teswa-core-01 ] && [ "$LIVE_STATE" = RUNNING ] || {
  echo 'runtime_live_discovery_operator=FAIL reason=target_not_running' >&2
  exit 4
}

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true

echo 'TESWA ORACLE LIVE DISCOVERY FUNCTIONS OPERATOR'
echo "target=$LIVE_NAME"
echo 'database=teswa_rehearsal'
echo 'functions=3'
echo 'runtime_role=teswa_app_authenticated'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo "artifact_sha256=$SHA"

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'
SHA='__SHA__'
DB=teswa_rehearsal
P=/usr/pgsql-17/bin/psql
DIR="$(mktemp -d /var/tmp/teswa-live-discovery-XXXXXX)"
trap 'rm -rf "$DIR"' EXIT

[ "$(hostname -s)" = core01 ] || { echo 'runtime_live_discovery_operator=FAIL reason=unexpected_guest_hostname'; exit 10; }
sudo -n true || { echo 'runtime_live_discovery_operator=FAIL reason=no_passwordless_sudo'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'runtime_live_discovery_operator=FAIL reason=postgres_inactive'; exit 12; }

python3 - "$OBJ" "$DIR/a.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
PY

printf '%s  %s\n' "$SHA" "$DIR/a.tgz" | sha256sum -c - >/dev/null || {
  echo 'runtime_live_discovery_operator=FAIL reason=artifact_sha_mismatch'
  exit 13
}
tar -xzf "$DIR/a.tgz" -C "$DIR"

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/runtime-live-discovery-functions.sql"
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$DIR/verify-runtime-live-discovery-functions.sql"

echo 'runtime_live_discovery_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || {
  echo 'runtime_live_discovery_operator=FAIL reason=run_command_text_limit' >&2
  exit 5
}

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
  --timeout-in-seconds 300 --display-name 'teswa-runtime-live-discovery' \
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
echo 'runtime_live_discovery_artifact_cleanup=PASS'
echo 'runtime_live_discovery_operator_cloudshell=PASS'
