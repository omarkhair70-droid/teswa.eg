#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/scripts/oci-migration/runtime-source"
MODE="${1:---plan}"
BUCKET="teswa-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$WORK/runtime-source.tar.gz"
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

case "$MODE" in
  --plan|--apply) ;;
  *) echo 'usage: deploy-canonical-runtime-source.sh [--plan|--apply]' >&2; exit 2 ;;
esac

required=(
  README.md requirements.txt
  domain-shadow/server.py
  domain-shadow/oracle_domain_read.py
  domain-shadow/oracle_media.py
  api-shell/shadow_gateway.py
  api-shell/shadow_gateway_base.py
  api-shell/healthz
)
for rel in "${required[@]}"; do
  [ -f "$SRC/$rel" ] || { echo "oracle_runtime_sync=FAIL reason=missing_$rel" >&2; exit 3; }
done

# Canonical source must never contain runtime secrets, bytecode, backups or vendored SDKs.
if find "$SRC" -type f \( -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name '*.pyc' -o -name '*.bak*' \) | grep -q .; then
  echo 'oracle_runtime_sync=FAIL reason=forbidden_runtime_artifact' >&2
  exit 4
fi
[ ! -d "$SRC/domain-shadow/vendor" ] || { echo 'oracle_runtime_sync=FAIL reason=vendored_sdk_in_source'; exit 5; }

tar -C "$SRC" -czf "$ARCHIVE" README.md requirements.txt domain-shadow api-shell
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"

echo 'TESWA ORACLE CANONICAL RUNTIME SYNC'
echo "mode=$MODE"
echo 'target=teswa-core-01'
echo 'domain_target=/opt/teswa/domain-shadow'
echo 'api_target=/opt/teswa/api-shell'
echo "artifact_sha256=$SHA"
echo 'restart=never_automatic'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'traffic_switch=none'

if [ "$MODE" = --plan ]; then
  echo 'oracle_runtime_sync_plan=PASS'
  exit 0
fi

[ "${TESWA_ALLOW_ORACLE_RUNTIME_SYNC:-}" = YES ] || {
  echo 'oracle_runtime_sync=BLOCKED reason=set_TESWA_ALLOW_ORACLE_RUNTIME_SYNC=YES' >&2
  exit 6
}

INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'oracle_runtime_sync=FAIL reason=core_not_found'; exit 7; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$NAME" = teswa-core-01 ] && [ "$STATE" = RUNNING ] || { echo 'oracle_runtime_sync=FAIL reason=unexpected_target'; exit 8; }

OBJECT="lane4-rehearsal/canonical-runtime/$STAMP-$SHA.tar.gz"
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
UPLOADED=true

GUEST="$(cat <<'GUEST_SCRIPT'
set -Eeuo pipefail
umask 077
OBJ='__OBJECT__'
SHA='__SHA__'
STAMP='__STAMP__'
D="$(mktemp -d /var/tmp/teswa-runtime-sync.XXXXXXXX)"
trap 'rm -rf "$D"' EXIT
[ "$(hostname -s)" = core01 ] || { echo 'oracle_runtime_sync=FAIL reason=wrong_host'; exit 20; }
sudo -n true || { echo 'oracle_runtime_sync=FAIL reason=no_sudo'; exit 21; }
DOMAIN=/opt/teswa/domain-shadow
API=/opt/teswa/api-shell
sudo test -d "$DOMAIN" && sudo test -d "$API" || { echo 'oracle_runtime_sync=FAIL reason=missing_live_mount_source'; exit 22; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz" | sha256sum -c - >/dev/null || { echo 'oracle_runtime_sync=FAIL reason=sha_mismatch'; exit 23; }
mkdir "$D/src" && tar -xzf "$D/a.tgz" -C "$D/src"
python3 -m py_compile "$D/src"/domain-shadow/*.py "$D/src"/api-shell/*.py
[ "$(cat "$D/src/requirements.txt")" = 'oci==2.185.2' ] || { echo 'oracle_runtime_sync=FAIL reason=unexpected_oci_pin'; exit 24; }
# Verify the dependency already proven live; never replace vendor behind a healthy service implicitly.
sudo env PYTHONPATH="$DOMAIN/vendor" python3 -c "import oci; assert oci.__version__ == '2.185.2'" || { echo 'oracle_runtime_sync=FAIL reason=live_oci_dependency_not_proven'; exit 25; }
BACKUP="/var/lib/teswa-runtime-backups/$STAMP"
sudo mkdir -p "$BACKUP/domain-shadow" "$BACKUP/api-shell"
sudo find "$DOMAIN" -maxdepth 1 -type f -exec cp -p {} "$BACKUP/domain-shadow/" \;
sudo find "$API" -maxdepth 1 -type f -exec cp -p {} "$BACKUP/api-shell/" \;
# Copy only repository-owned source. Preserve env, vendor, generated state and any unrelated host files.
for f in "$D/src"/domain-shadow/*.py; do sudo install -o root -g root -m 0644 "$f" "$DOMAIN/$(basename "$f")"; done
sudo install -o root -g root -m 0644 "$D/src/requirements.txt" "$DOMAIN/requirements.txt"
for f in shadow_gateway.py shadow_gateway_base.py healthz; do sudo install -o root -g root -m 0644 "$D/src/api-shell/$f" "$API/$f"; done
# Expand globs inside the privileged shell because the Instance Agent user cannot traverse the 0750 runtime mount.
sudo bash -c 'python3 -m py_compile "$1"/*.py "$2"/*.py' _ "$DOMAIN" "$API"
# This operator deliberately does not restart services. Current healthy processes remain untouched.
echo "rollback_backup=$BACKUP"
echo 'restart_performed=false'
echo 'production_cutover=false'
echo 'supabase_mutation=false'
echo 'oracle_runtime_sync=PASS'
GUEST_SCRIPT
)"
GUEST="${GUEST//__OBJECT__/$OBJECT}"
GUEST="${GUEST//__SHA__/$SHA}"
GUEST="${GUEST//__STAMP__/$STAMP}"
BYTES="$(printf '%s' "$GUEST" | wc -c | tr -d ' ')"
[ "$BYTES" -le 4096 ] || { echo "oracle_runtime_sync=FAIL reason=guest_script_too_large bytes=$BYTES"; exit 9; }

python3 - "$CONTENT" "$GUEST" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" \
  --content "file://$CONTENT" --target "file://$TARGET" \
  --timeout-in-seconds 300 --display-name "teswa-canonical-runtime-$STAMP" \
  --query 'data.id' --raw-output)"
echo "command_id=$CID"

while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text", ""));print(c.get("message", ""))'
      [ "$S" = SUCCEEDED ] || exit 10
      break
      ;;
  esac
  sleep 3
done

oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null
UPLOADED=false
echo 'oracle_runtime_sync_artifact_cleanup=PASS'
echo 'next_action=review_live_diff_then_explicit_restart_or_recreate_only_if_approved'
