#!/usr/bin/env bash
set -Eeuo pipefail

# One-shot Lane 4 storage rehearsal operator.
# Source: Supabase Storage (read-only HTTP metadata + GET object bytes).
# Target: pre-created private OCI Object Storage buckets only.
# No source deletes, no OCI deletes, no production cutover.
# Requires only one Supabase server-side admin key; no database URL/password.

export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${TESWA_STORAGE_REHEARSAL_OUT:-$HOME/teswa-migration-evidence/storage-${STAMP}}"

fail() { echo "storage_rehearsal_operator=FAIL reason=$1" >&2; exit "${2:-2}"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing_$1" 3; }

need python3
need oci

# Resolve the exact OCI compartment from the already-authoritative core instance.
INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'teswa-core-01'" \
  --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || fail core_instance_not_found 4
LIVE_NAME="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."display-name"' --raw-output)"
LIVE_STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$LIVE_NAME" = "teswa-core-01" ] && [ "$LIVE_STATE" = "RUNNING" ] || fail core_target_not_running 5
export TESWA_OCI_COMPARTMENT_OCID="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"

# Public project URL is deterministic. Accept modern sb_secret or legacy
# service_role; keep the value process-memory-only and never echo it.
export TESWA_SUPABASE_URL="${TESWA_SUPABASE_URL:-https://nvgxjvbsyvnfdakqhswq.supabase.co}"
if [ -z "${TESWA_SUPABASE_ADMIN_KEY:-}" ]; then
  for candidate in TESWA_SUPABASE_SECRET_KEY TESWA_SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
    if [ -n "${!candidate:-}" ]; then
      export TESWA_SUPABASE_ADMIN_KEY="${!candidate}"
      break
    fi
  done
fi
if [ -z "${TESWA_SUPABASE_ADMIN_KEY:-}" ]; then
  echo "storage_admin_key_required=true"
  echo "accepted_key_types=sb_secret_or_legacy_service_role"
  echo "database_password_required=false"
  read -rsp 'Paste Supabase admin key (hidden): ' TESWA_SUPABASE_ADMIN_KEY
  echo
  export TESWA_SUPABASE_ADMIN_KEY
fi
[ -n "${TESWA_SUPABASE_ADMIN_KEY:-}" ] || fail empty_supabase_admin_key 20
if [[ "$TESWA_SUPABASE_ADMIN_KEY" != sb_secret_* ]] && [ "$(awk -F. '{print NF}' <<<"$TESWA_SUPABASE_ADMIN_KEY")" -ne 3 ]; then
  fail supabase_admin_key_shape_invalid 21
fi

echo "credentials_echoed=false"
echo "database_password_required=false"
echo "supabase_admin_key_loaded=true"

# Verify target bucket reality before reading all source media bytes.
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
echo "source_transport=storage_https_read_only"
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
unset TESWA_SUPABASE_ADMIN_KEY TESWA_SUPABASE_SECRET_KEY TESWA_SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY || true
echo "local_media_byte_copies_cleanup=PASS"
echo "evidence_manifests_preserved=true"
echo "credentials_retained_on_disk=false"
echo "supabase_mutation=none"
echo "target_deletions=none"
echo "production_cutover=none"
echo "storage_rehearsal_operator=PASS"
