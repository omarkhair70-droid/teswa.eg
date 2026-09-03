#!/usr/bin/env bash
set -Eeuo pipefail

# Capture a transaction-consistent public-data archive from the authoritative
# Supabase PostgreSQL source. Source is read-only. Output defaults outside Git.

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need pg_dump
need pg_restore
need sha256sum

if [[ -z "${TESWA_SOURCE_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_SOURCE_DATABASE_URL." >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-public-data-${STAMP}}"
mkdir -p "${OUT}"

export PGDATABASE="${TESWA_SOURCE_DATABASE_URL}"
export PGOPTIONS="${PGOPTIONS:-} -c default_transaction_read_only=on -c statement_timeout=0 -c lock_timeout=5000"

ARCHIVE="${OUT}/public-data.dump"

pg_dump   --data-only   --schema=public   --format=custom   --compress=6   --no-owner   --no-privileges   --file="${ARCHIVE}"

pg_restore --list "${ARCHIVE}" > "${OUT}/archive.list"
sha256sum "${ARCHIVE}" "${OUT}/archive.list" > "${OUT}/SHA256SUMS"

cat > "${OUT}/README.txt" <<EOF
Teswa transaction-consistent public data snapshot
Captured UTC: ${STAMP}

Source safety:
- pg_dump only
- public schema data only
- source default_transaction_read_only=on
- no source writes
- no credentials written

Restore order:
1. portable 00-extensions.sql
2. portable 10-structure.sql
3. restore public-data.dump
4. portable 20-integrity.sql
5. portable 30-public-foreign-keys.sql
6. external identity FKs/runtime behavior only after dedicated review
EOF

echo "Public data snapshot complete: ${OUT}"
echo "No source writes were performed."
echo "Do not commit the archive; it can contain production user/application data."
