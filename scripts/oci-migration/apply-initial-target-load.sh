#!/usr/bin/env bash
set -Eeuo pipefail

# Apply a Lane-4 portable baseline + public data archive to an EMPTY isolated
# OCI PostgreSQL target only.
#
# This script mutates the target. It refuses Supabase-looking hosts, requires an
# explicit expected hostname assertion, and requires an empty public schema.

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need psql
need pg_restore
need python3

BASELINE_DIR="${1:-}"
DATA_ARCHIVE="${2:-}"

if [[ -z "${BASELINE_DIR}" || -z "${DATA_ARCHIVE}" ]]; then
  echo "Usage: $0 <compiled-baseline-dir> <public-data.dump>" >&2
  exit 2
fi

if [[ -z "${TESWA_OCI_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_OCI_DATABASE_URL." >&2
  exit 2
fi

if [[ "${TESWA_ALLOW_TARGET_WRITE:-}" != "YES" ]]; then
  echo "Refusing target mutation. Set TESWA_ALLOW_TARGET_WRITE=YES." >&2
  exit 2
fi

if [[ -z "${TESWA_TARGET_ASSERT_HOST:-}" ]]; then
  echo "Set TESWA_TARGET_ASSERT_HOST to the exact reviewed OCI PostgreSQL hostname." >&2
  exit 2
fi

TARGET_HOST="$(
python3 - <<'PY'
import os
from urllib.parse import urlparse
value = os.environ["TESWA_OCI_DATABASE_URL"]
parsed = urlparse(value)
if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
    raise SystemExit("TESWA_OCI_DATABASE_URL must be a PostgreSQL URL.")
print(parsed.hostname)
PY
)"

if [[ "${TARGET_HOST}" != "${TESWA_TARGET_ASSERT_HOST}" ]]; then
  echo "Target host assertion failed." >&2
  echo "Resolved host: ${TARGET_HOST}" >&2
  exit 3
fi

case "${TARGET_HOST}" in
  *supabase*|*.supabase.co)
    echo "Refusing to run against a Supabase-looking target host: ${TARGET_HOST}" >&2
    exit 3
    ;;
esac

for file in   "${BASELINE_DIR}/00-extensions.sql"   "${BASELINE_DIR}/10-structure.sql"   "${BASELINE_DIR}/20-integrity.sql"   "${BASELINE_DIR}/30-public-foreign-keys.sql"
do
  [[ -f "${file}" ]] || {
    echo "Missing compiled baseline file: ${file}" >&2
    exit 4
  }
done

[[ -f "${DATA_ARCHIVE}" ]] || {
  echo "Missing public data archive: ${DATA_ARCHIVE}" >&2
  exit 4
}

export PGDATABASE="${TESWA_OCI_DATABASE_URL}"

PUBLIC_TABLES="$(
  psql -X -q -A -t -v ON_ERROR_STOP=1 -c "
    SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p');
  "
)"

if [[ "${PUBLIC_TABLES}" != "0" ]]; then
  echo "Refusing initial load: target public schema is not empty (tables=${PUBLIC_TABLES})." >&2
  exit 5
fi

echo "[1/5] Applying portable extensions..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/00-extensions.sql"

echo "[2/5] Applying portable table structure..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/10-structure.sql"

echo "[3/5] Restoring public data archive..."
pg_restore   --data-only   --single-transaction   --exit-on-error   --no-owner   --no-privileges   --dbname="${TESWA_OCI_DATABASE_URL}"   "${DATA_ARCHIVE}"

echo "[4/5] Applying non-FK integrity/index/view layer..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/20-integrity.sql"

echo "[5/5] Applying public-to-public foreign keys..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/30-public-foreign-keys.sql"

echo
echo "Initial isolated OCI data load complete."
echo "Provider/runtime objects and external identity FKs remain intentionally unapplied."
