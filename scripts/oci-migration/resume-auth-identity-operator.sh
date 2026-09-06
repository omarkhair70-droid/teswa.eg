#!/usr/bin/env bash
set -Eeuo pipefail

# Lane 4 operator continuation for the exact state where the database/data gate is
# GREEN but teswa_identity is absent on teswa_rehearsal. This script does not
# repeat the database load/parity gates and never mutates Supabase.
#
# It packages the already-compiled identity anchor evidence outside Git, uploads
# it to the existing private teswa-backups rehearsal prefix, applies it exactly
# once only when teswa_identity is absent, verifies it, then reports the API
# runtime standing point. The temporary Object Storage artifact is removed after
# a successful run.

export USER="${USER:-$(id -un)}"
umask 077

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_ROOT="${TESWA_MIGRATION_EVIDENCE_ROOT:-$HOME/teswa-migration-evidence}"
IDENTITY_ROOT="${TESWA_IDENTITY_EVIDENCE_ROOT:-$EVIDENCE_ROOT/identity-20260906}"
IDENTITY_MAP="$IDENTITY_ROOT/input/identity-map.json"
IDENTITY_SQL="$IDENTITY_ROOT/compiled/apply-identity-anchor.sql"
IDENTITY_PLAN="$IDENTITY_ROOT/compiled/identity-anchor-plan.json"
VERIFY_SCRIPT="$REPO/scripts/oci-migration/verify-identity-anchor.py"
TARGET_CONFIG="$EVIDENCE_ROOT/lane4-target.json"
BUCKET="teswa-backups"

for f in "$IDENTITY_MAP" "$IDENTITY_SQL" "$IDENTITY_PLAN" "$VERIFY_SCRIPT"; do
  [ -f "$f" ] || { echo "auth_identity_operator=FAIL reason=missing_file path=$f" >&2; exit 2; }
done

python3 - "$IDENTITY_PLAN" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert p.get('format_version') == 1
assert p.get('users') == 32
assert p.get('identities') == 32
assert p.get('identity_fks') == 21
assert p.get('credential_material_included') is False
print('compiled_identity_plan=PASS')
PY

if [ ! -f "$TARGET_CONFIG" ]; then
  INSTANCE_ID="$(oci search resource structured-search \
    --query-text "query instance resources where displayName = 'teswa-core-01'" \
    --query 'data.items[0].identifier' --raw-output)"
  [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
    echo "auth_identity_operator=FAIL reason=core_instance_not_found" >&2; exit 3;
  }
  COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" \
    --query 'data."compartment-id"' --raw-output)"
  python3 - "$TARGET_CONFIG" "$COMPARTMENT" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'compartment':sys.argv[2],'instance':sys.argv[3]},open(sys.argv[1],'w'))
PY
else
  read -r COMPARTMENT INSTANCE_ID < <(python3 - "$TARGET_CONFIG" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(x['compartment'],x['instance'])
PY
)
fi

LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = "teswa-core-01" ] && [ "$LIVE_STATE" = "RUNNING" ] || {
  echo "auth_identity_operator=FAIL reason=wrong_or_unavailable_target" >&2; exit 4;
}

echo "control_plane_target=$LIVE_NAME"
echo "control_plane_instance_state=$LIVE_STATE"

STAGE="$(mktemp -d)"
ARCHIVE="$(mktemp --suffix=.tar.gz)"
CONTENT_FILE="$(mktemp)"
TARGET_FILE="$(mktemp)"
cleanup() { rm -rf "$STAGE" "$ARCHIVE" "$CONTENT_FILE" "$TARGET_FILE"; }
trap cleanup EXIT

cp "$IDENTITY_MAP" "$STAGE/identity-map.json"
cp "$IDENTITY_SQL" "$STAGE/apply-identity-anchor.sql"
cp "$VERIFY_SCRIPT" "$STAGE/verify-identity-anchor.py"
chmod 600 "$STAGE"/*
tar -C "$STAGE" -czf "$ARCHIVE" .
ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
OBJECT="lane4-rehearsal/identity-runtime/${ARCHIVE_SHA}.tar.gz"

oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null
echo "identity_artifact_upload=PASS"
echo "identity_artifact_sha256=$ARCHIVE_SHA"

# Keep the guest program literal. The previous implementation used an unquoted
# heredoc and accidentally expanded guest variables such as $candidate and $P
# in Cloud Shell before Run Command delivery.
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
DB=teswa_rehearsal
OBJ='__OBJECT__'
SHA='__SHA__'
DIR=/var/tmp/teswa-lane4-identity-${SHA:0:12}
echo "guest_hostname=$(hostname -s)"
echo 'target_identity_source=oci_control_plane_instance_id'
systemctl is-active --quiet postgresql-17 || { echo 'auth_identity_operator=FAIL reason=postgres_inactive'; exit 11; }
P=''
for candidate in /usr/pgsql-17/bin/psql /usr/bin/psql; do
  if sudo -u postgres "$candidate" --version >/dev/null 2>&1; then P="$candidate"; break; fi
done
if [ -z "$P" ]; then
  candidate="$(sudo -u postgres sh -lc 'command -v psql 2>/dev/null || true')"
  if [ -n "$candidate" ] && sudo -u postgres "$candidate" --version >/dev/null 2>&1; then P="$candidate"; fi
fi
if [ -z "$P" ]; then
  candidate="$(rpm -ql postgresql17 2>/dev/null | awk '/\/psql$/ {print; exit}' || true)"
  if [ -n "$candidate" ] && sudo -u postgres "$candidate" --version >/dev/null 2>&1; then P="$candidate"; fi
fi
if [ -z "$P" ]; then
  echo 'postgres_service_active=true'
  echo "postgres17_package=$(rpm -q postgresql17 2>/dev/null || echo missing)"
  echo "postgres17_server_package=$(rpm -q postgresql17-server 2>/dev/null || echo missing)"
  echo 'auth_identity_operator=FAIL reason=psql_client_unresolvable'
  exit 12
fi
echo "psql_path=$P"
probe="$(sudo -u postgres "$P" -d postgres -Atqc 'SELECT 1')"
[ "$probe" = 1 ] || { echo 'auth_identity_operator=FAIL reason=psql_probe_failed'; exit 12; }
echo 'psql_access=postgres_sudo_context'
db_name="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT current_database()')"
pg_major="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT current_setting('server_version_num')::int / 10000")"
server_addr="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT coalesce(inet_server_addr()::text,'local')")"
[ "$db_name" = "$DB" ] || { echo 'auth_identity_operator=FAIL reason=wrong_database'; exit 13; }
[ "$pg_major" = 17 ] || { echo 'auth_identity_operator=FAIL reason=wrong_postgres_major'; exit 14; }
[ "$server_addr" = local ] || { echo 'auth_identity_operator=FAIL reason=nonlocal_postgres_connection'; exit 15; }
echo "database_target=$db_name"
echo "postgres_major=$pg_major"
echo "postgres_connection=$server_addr"
python3 - "$OBJ" "$DIR.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
ns=c.get_namespace().data
r=c.get_object(ns,'teswa-backups',sys.argv[1])
open(sys.argv[2],'wb').write(r.data.content)
print('identity_artifact_download=PASS')
PY
printf '%s  %s\n' "$SHA" "$DIR.tgz" | sha256sum -c - >/dev/null
rm -rf "$DIR"; mkdir -m 700 "$DIR"; tar -C "$DIR" -xzf "$DIR.tgz"; rm -f "$DIR.tgz"
schema="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_namespace WHERE nspname='teswa_identity'")"
if [ "$schema" = 0 ]; then
  echo 'identity_anchor_state=absent_apply_once'
  sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/apply-identity-anchor.sql"
elif [ "$schema" = 1 ]; then
  echo 'identity_anchor_state=present_skip_apply'
else
  echo 'auth_identity_operator=FAIL reason=unexpected_identity_schema_count'; exit 16
fi
python3 "$DIR/verify-identity-anchor.py" "$DIR/identity-map.json" --output "$DIR/identity-verify.json" --psql "$P"
api_active=false; systemctl is-active --quiet teswa-api && api_active=true || true
api_enabled=false; systemctl is-enabled --quiet teswa-api >/dev/null 2>&1 && api_enabled=true || true
health=000; if [ "$api_active" = true ]; then health="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/healthz || true)"; fi
listener=false; ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3100[[:space:]]' && listener=true || true
echo "api_service_active=$api_active"
echo "api_service_enabled=$api_enabled"
echo "api_health_http=$health"
echo "api_listener_local=$listener"
echo 'database_mutation=identity_anchor_only_if_absent'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'auth_identity_operator=PASS'
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"
SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$ARCHIVE_SHA}"

BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo "auth_identity_operator=FAIL reason=run_command_text_limit" >&2; exit 5; }

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
  --timeout-in-seconds 600 --display-name "teswa-lane4-auth-identity-operator" \
  --query 'data.id' --raw-output)"
echo "command_id=$CID"

FINAL_STATE=""
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      FINAL_STATE="$S"
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text", ""));print(c.get("message", ""))'
      break
      ;;
  esac
  sleep 3
done

if [ "$FINAL_STATE" = SUCCEEDED ]; then
  oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null || true
  echo "identity_artifact_cleanup=PASS"
  echo "auth_identity_operator_cloudshell=PASS"
else
  echo "identity_artifact_retained_for_diagnosis=$OBJECT" >&2
  exit 6
fi
