#!/usr/bin/env bash
set -Eeuo pipefail

# One-shot Lane 4 storage rehearsal operator.
# Source: Supabase Storage (read-only metadata + GET object bytes).
# Target: pre-created private OCI Object Storage buckets only.
# No source deletes, no OCI deletes, no production cutover.

export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${TESWA_STORAGE_REHEARSAL_OUT:-$HOME/teswa-migration-evidence/storage-${STAMP}}"

fail() { echo "storage_rehearsal_operator=FAIL reason=$1" >&2; exit "${2:-2}"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing_$1" 3; }

need python3
need oci
need podman

# Resolve the exact OCI compartment from the already-authoritative core instance.
INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || fail core_instance_not_found 4
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = "teswa-core-01" ] && [ "$LIVE_STATE" = "RUNNING" ] || fail core_target_not_running 5
export TESWA_OCI_COMPARTMENT_OCID="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"

# Public project URL is deterministic; credentials stay environment-only.
export TESWA_SUPABASE_URL="${TESWA_SUPABASE_URL:-https://nvgxjvbsyvnfdakqhswq.supabase.co}"
if [ -z "${TESWA_SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  export TESWA_SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
fi

missing=()
[ -n "${TESWA_SOURCE_DATABASE_URL:-}" ] || missing+=(TESWA_SOURCE_DATABASE_URL)
[ -n "${TESWA_SUPABASE_SERVICE_ROLE_KEY:-}" ] || missing+=(TESWA_SUPABASE_SERVICE_ROLE_KEY)
if [ "${#missing[@]}" -ne 0 ]; then
  echo "storage_rehearsal_operator=BLOCKED"
  printf 'missing_required_env=%s\n' "$(IFS=,; echo "${missing[*]}")"
  echo "credentials_echoed=false"
  echo "supabase_mutation=none"
  echo "oci_mutation=none"
  exit 20
fi

# Cloud Shell commonly lacks native psql. Build an ephemeral postgres:17 psql shim
# rather than requiring the user to install anything into Cloud Shell.
if ! command -v psql >/dev/null 2>&1; then
  SHIM_DIR="$(mktemp -d)"
  trap 'rm -rf "$SHIM_DIR"' EXIT
  if ! podman image exists docker.io/library/postgres:17 >/dev/null 2>&1; then
    echo "psql_runtime_image=pulling_postgres17"
    podman pull docker.io/library/postgres:17 >/dev/null
  fi
  cat >"$SHIM_DIR/psql" <<'SHIM'
#!/usr/bin/env bash
set -Eeuo pipefail
exec podman run --rm --network host \
  -e PGDATABASE -e PGOPTIONS \
  docker.io/library/postgres:17 psql "$@"
SHIM
  chmod 700 "$SHIM_DIR/psql"
  export PATH="$SHIM_DIR:$PATH"
  echo "psql_mode=ephemeral_postgres17_container"
else
  echo "psql_mode=native"
fi
psql --version >/dev/null 2>&1 || fail psql_runtime_unavailable 6

# Verify target bucket reality before downloading ~120 MiB from the source.
NS="$(oci os ns get --query data --raw-output)"
[ -n "$NS" ] && [ "$NS" != "null" ] || fail object_storage_namespace_missing 7
BUCKET_JSON="$(oci os bucket get --namespace-name "$NS" --bucket-name teswa-media --output json)"
ACTUAL_COMPARTMENT="$(printf '%s' "$BUCKET_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["compartment-id"])')"
PUBLIC_ACCESS="$(printf '%s' "$BUCKET_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["public-access-type"])')"
[ "$ACTUAL_COMPARTMENT" = "$TESWA_OCI_COMPARTMENT_OCID" ] || fail teswa_media_wrong_compartment 8
[ "$PUBLIC_ACCESS" = "NoPublicAccess" ] || fail teswa_media_not_private 9

export TESWA_ALLOW_TARGET_WRITE=YES
export TESWA_OCI_STORAGE_ASSERTION=YES
mkdir -p "$OUT"

echo "TESWA LANE 4 STORAGE REHEARSAL OPERATOR"
echo "control_plane_target=$LIVE_NAME"
echo "control_plane_state=$LIVE_STATE"
echo "source_project=nvgxjvbsyvnfdakqhswq"
echo "source_mutation=none"
echo "target_bucket=teswa-media"
echo "target_bucket_private=true"
echo "target_deletions=none"
echo "production_cutover=none"
echo "credentials_echoed=false"
echo "evidence=$OUT"

bash "$ROOT/scripts/oci-migration/run-storage-rehearsal.sh" "$OUT"

python3 - "$OUT" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
s=json.load(open(root/'source-storage-hashed.json'))
t=json.load(open(root/'oci-storage-hashed.json'))
r=json.load(open(root/'storage-parity-report.json'))
so=int(s.get('object_count', len(s.get('objects',[]))))
to=int(t.get('object_count', len(t.get('objects',[]))))
sb=int(s.get('total_bytes', sum(int(x.get('size_bytes') or 0) for x in s.get('objects',[]))))
tb=int(t.get('total_bytes', sum(int(x.get('size_bytes') or 0) for x in t.get('objects',[]))))
if so <= 0 or so != to or sb != tb:
    raise SystemExit('storage_rehearsal_operator=FAIL reason=post_parity_summary_mismatch')
# The compare script is authoritative; require its report to contain no mismatch signal.
text=json.dumps(r, sort_keys=True).lower()
if '"match": false' in text or '"passed": false' in text or '"hard_gate_pass": false' in text:
    raise SystemExit('storage_rehearsal_operator=FAIL reason=parity_report_not_green')
print(f'storage_objects={so}')
print(f'storage_bytes={sb}')
print('storage_source_target_counts=PASS')
print('storage_source_target_bytes=PASS')
print('storage_content_sha256_parity=PASS')
PY

# Preserve manifests/evidence, not duplicate production media bytes in Cloud Shell.
rm -rf "$OUT/source-bytes" "$OUT/oci-bytes"
echo "local_media_byte_copies_cleanup=PASS"
echo "evidence_manifests_preserved=true"
echo "supabase_mutation=none"
echo "target_deletions=none"
echo "production_cutover=none"
echo "storage_rehearsal_operator=PASS"
