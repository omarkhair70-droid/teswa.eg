#!/usr/bin/env bash
set -Eeuo pipefail

# Capture a raw, read-only current-state source baseline for Teswa.
#
# This is NOT an apply script. The public schema dump is evidence/input for
# building the portable OCI baseline; it must not be replayed blindly because
# the live public schema contains Supabase auth/storage/runtime dependencies.

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need pg_dump
need psql
need python3
need sha256sum

if [[ -z "${TESWA_SOURCE_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_SOURCE_DATABASE_URL to the read-only/source PostgreSQL connection string." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-oci-source-baseline-${STAMP}}"
mkdir -p "${OUT}"

# Keep credentials out of command-line arguments.
export PGDATABASE="${TESWA_SOURCE_DATABASE_URL}"
export PGOPTIONS="${PGOPTIONS:-} -c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000"

cat >"${OUT}/README.txt" <<EOF
Teswa raw source current-state baseline
Captured UTC: ${STAMP}

SAFETY:
- source capture only
- PostgreSQL default_transaction_read_only=on
- no DDL/DML
- no Supabase mutation
- credentials are not written to this directory

IMPORTANT:
public-schema.raw.sql is NOT a portable OCI bootstrap by itself.
It can contain references to Supabase auth.uid(), auth.users, storage/runtime
behavior, and provider-specific extension assumptions. Compile/rebuild those
surfaces deliberately before target apply.
EOF

pg_dump   --schema-only   --schema=public   --no-owner   --no-privileges   --quote-all-identifiers   --file="${OUT}/public-schema.raw.sql"

MANIFEST_ARGS=(
  "${ROOT}/scripts/oci-migration/capture-postgres-manifest.py"
  --database-url-env TESWA_SOURCE_DATABASE_URL
  --label supabase-source
  --output "${OUT}/source-manifest.json"
)

if [[ "${TESWA_DEEP_CHECKSUMS:-0}" == "1" ]]; then
  MANIFEST_ARGS+=(--deep)
fi

python3 "${MANIFEST_ARGS[@]}"

# Keep the earlier human-readable inventory alongside the machine manifest.
psql   -X   -q   -v ON_ERROR_STOP=1   -f "${ROOT}/scripts/supabase-to-oci-readonly-inventory.sql"   >"${OUT}/source-inventory.txt"

(
  cd "${OUT}"
  sha256sum public-schema.raw.sql source-manifest.json source-inventory.txt > SHA256SUMS
)

echo
echo "Source baseline capture complete: ${OUT}"
echo "No source writes were performed."
echo "Do not commit this output; it can contain schema/resource metadata."
