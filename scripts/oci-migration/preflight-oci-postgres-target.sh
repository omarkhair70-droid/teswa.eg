#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only Lane-4 readiness gate for the future teswa-core-01 PostgreSQL target.
# Run on the core host itself or through an approved private execution path.
#
# No schema/data mutation is performed.

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need psql
need python3

if [[ -z "${TESWA_OCI_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_OCI_DATABASE_URL." >&2
  exit 2
fi

export PGDATABASE="${TESWA_OCI_DATABASE_URL}"
export PGOPTIONS="${PGOPTIONS:-} -c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000"

VERSION_NUM="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num;')"
MAJOR="$(( VERSION_NUM / 10000 ))"
if [[ "$MAJOR" -ne 17 ]]; then
  echo "postgres_major=$MAJOR"
  echo "postgres_version_gate=FAIL expected=17" >&2
  exit 3
fi

LISTEN="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SHOW listen_addresses;')"
PORT="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SHOW port;')"
DBNAME="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SELECT current_database();')"
USER_NAME="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SELECT current_user;')"

PUBLIC_TABLES="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "
  SELECT count(*)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p');
")"

PUBLIC_VIEWS="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c "
  SELECT count(*)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v';
")"

case ",$LISTEN," in
  *,*,* )
    ;;
esac

python3 - "$LISTEN" <<'PY'
import ipaddress, sys
raw=sys.argv[1]
values=[x.strip() for x in raw.split(",") if x.strip()]
bad=[]
for value in values:
    if value in {"*", "0.0.0.0", "::"}:
        bad.append(value)
        continue
    if value in {"localhost", "127.0.0.1", "::1"}:
        continue
    try:
        ip=ipaddress.ip_address(value)
    except ValueError:
        # Hostnames are allowed only if they are not wildcard-like. Network
        # controls are additionally verified by Lane 3.
        continue
    if not (ip.is_private or ip.is_loopback):
        bad.append(value)
if bad:
    print("listen_address_gate=FAIL")
    print("public_or_wildcard="+",".join(bad))
    raise SystemExit(4)
print("listen_address_gate=PASS")
PY

if [[ "$PORT" != "5432" ]]; then
  echo "postgres_port=$PORT"
  echo "postgres_port_gate=FAIL expected=5432" >&2
  exit 5
fi

if [[ "$PUBLIC_TABLES" != "0" || "$PUBLIC_VIEWS" != "0" ]]; then
  echo "public_tables=$PUBLIC_TABLES"
  echo "public_views=$PUBLIC_VIEWS"
  echo "empty_target_gate=FAIL" >&2
  exit 6
fi

READ_ONLY_FLAG="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -c 'SHOW default_transaction_read_only;')"

python3 - "$VERSION_NUM" "$LISTEN" "$PORT" "$DBNAME" "$USER_NAME" "$PUBLIC_TABLES" "$PUBLIC_VIEWS" "$READ_ONLY_FLAG" <<'PY'
import json,sys
print(json.dumps({
  "postgres_version_num": int(sys.argv[1]),
  "postgres_major": int(sys.argv[1]) // 10000,
  "listen_addresses": sys.argv[2],
  "port": int(sys.argv[3]),
  "database": sys.argv[4],
  "user": sys.argv[5],
  "public_tables": int(sys.argv[6]),
  "public_views": int(sys.argv[7]),
  "session_default_transaction_read_only": sys.argv[8],
  "postgres_target_readiness": "PASS"
}, indent=2))
PY

echo "No target writes were performed."
