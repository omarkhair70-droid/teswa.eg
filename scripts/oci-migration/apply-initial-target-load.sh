#!/usr/bin/env bash
set -Eeuo pipefail

# Apply a Lane-4 portable baseline + public data archive to the EMPTY
# teswa_rehearsal database on teswa-core-01 only.
#
# IMPORTANT: this is a FUTURE rehearsal mutation helper. It must not be executed
# during read-only preparation. It refuses non-local targets, non-rehearsal DBs,
# Supabase-looking hosts, non-empty targets, and missing explicit rehearsal/write
# acknowledgements.

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

if [[ "${TESWA_REHEARSAL_TARGET:-}" != "YES" ]]; then
  echo "Refusing target mutation. Set TESWA_REHEARSAL_TARGET=YES." >&2
  exit 2
fi

if [[ "${TESWA_ALLOW_TARGET_WRITE:-}" != "YES" ]]; then
  echo "Refusing target mutation. Set TESWA_ALLOW_TARGET_WRITE=YES." >&2
  exit 2
fi

if [[ -z "${TESWA_TARGET_ASSERT_HOST:-}" ]]; then
  echo "Set TESWA_TARGET_ASSERT_HOST to the exact reviewed local PostgreSQL host." >&2
  exit 2
fi

read -r TARGET_HOST TARGET_DB <<EOF
$(python3 - <<'PY'
import os
from urllib.parse import urlparse
value = os.environ["TESWA_OCI_DATABASE_URL"]
parsed = urlparse(value)
if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
    raise SystemExit("TESWA_OCI_DATABASE_URL must be a PostgreSQL URL.")
print(parsed.hostname, parsed.path.lstrip("/"))
PY
)
EOF

if [[ "${TARGET_HOST}" != "${TESWA_TARGET_ASSERT_HOST}" ]]; then
  echo "Target host assertion failed." >&2
  echo "Resolved host: ${TARGET_HOST}" >&2
  exit 3
fi

case "${TARGET_HOST}" in
  127.0.0.1|localhost)
    ;;
  *supabase*|*.supabase.co)
    echo "Refusing Supabase-looking target host: ${TARGET_HOST}" >&2
    exit 3
    ;;
  *)
    echo "Refusing non-local target host: ${TARGET_HOST}." >&2
    echo "Current Lane 3 handoff requires localhost-only PostgreSQL on teswa-core-01." >&2
    exit 3
    ;;
esac

if [[ "${TARGET_DB}" != "teswa_rehearsal" ]]; then
  echo "Refusing non-rehearsal database: ${TARGET_DB}" >&2
  exit 3
fi

for file in \
  "${BASELINE_DIR}/00-extensions.sql" \
  "${BASELINE_DIR}/10-structure.sql" \
  "${BASELINE_DIR}/20-integrity.sql" \
  "${BASELINE_DIR}/30-public-foreign-keys.sql"
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

MAJOR="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT current_setting('server_version_num')::int / 10000;")"
LISTEN="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "SHOW listen_addresses;")"
PORT="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "SHOW port;")"
CURRENT_DB="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database();")"

[[ "$MAJOR" == "17" ]] || { echo "Refusing wrong PostgreSQL major: $MAJOR" >&2; exit 5; }
[[ "$LISTEN" == "127.0.0.1" ]] || { echo "Refusing unexpected listen_addresses: $LISTEN" >&2; exit 5; }
[[ "$PORT" == "5432" ]] || { echo "Refusing unexpected PostgreSQL port: $PORT" >&2; exit 5; }
[[ "$CURRENT_DB" == "teswa_rehearsal" ]] || { echo "Refusing unexpected database: $CURRENT_DB" >&2; exit 5; }

PUBLIC_RELATIONS="$(
  psql -X -q -A -t -v ON_ERROR_STOP=1 -c "
    SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f');
  "
)"

if [[ "${PUBLIC_RELATIONS}" != "0" ]]; then
  echo "Refusing initial load: target public schema is not empty (relations=${PUBLIC_RELATIONS})." >&2
  exit 5
fi

echo "TESWA LANE 4 INITIAL REHEARSAL LOAD"
echo "target=teswa-core-01/teswa_rehearsal"
echo "production_cutover=none"
echo "supabase_mutation=none"
echo "credentials_created=none"
echo

echo "[1/5] Applying portable extensions..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/00-extensions.sql"

echo "[2/5] Applying portable table structure..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/10-structure.sql"

echo "[3/5] Restoring public data archive..."
pg_restore \
  --data-only \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="${TESWA_OCI_DATABASE_URL}" \
  "${DATA_ARCHIVE}"

echo "[4/5] Applying non-FK integrity/index/view layer..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/20-integrity.sql"

echo "[5/5] Applying public-to-public foreign keys..."
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE_DIR}/30-public-foreign-keys.sql"

echo
echo "Initial isolated OCI rehearsal load complete."
echo "Provider/runtime objects and external identity FKs remain intentionally unapplied."
echo "No production cutover was performed."
