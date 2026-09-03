#!/usr/bin/env bash
set -Eeuo pipefail

OUT="${TESWA_PHASE4_CORE_SERIAL_CONNECTION:-phase4-core-serial-console.local.txt}"
MAX_ATTEMPTS="${TESWA_SERIAL_RECONNECT_ATTEMPTS:-60}"
SLEEP_SECONDS="${TESWA_SERIAL_RECONNECT_SLEEP_SECONDS:-1}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$OUT" ] || {
  echo "serial_reconnect=FAIL reason=connection_file_missing file=$OUT" >&2
  exit 2
}

# shellcheck disable=SC1090
source "$OUT"

[ -n "${CONNECTION_COMMAND:-}" ] || {
  echo "serial_reconnect=FAIL reason=connection_command_missing" >&2
  exit 3
}

echo "TESWA PHASE 4 CORE SERIAL-CONSOLE RECONNECT"
echo "mode=retry_until_attached"
echo "max_attempts=$MAX_ATTEMPTS"
echo "sleep_seconds=$SLEEP_SECONDS"
echo "guest_mutation=none"
echo "network_mutation=none"
echo
echo "When the serial console attaches, keep this terminal focused and press Ctrl+[ repeatedly to send ESC during boot."

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "reconnect_attempt=$attempt"
  set +e
  eval "$CONNECTION_COMMAND"
  rc=$?
  set -e

  # A successful interactive attachment normally remains in the foreground until
  # the remote console closes. If it returns, retry unless the operator stops us.
  echo "serial_connection_returned_rc=$rc"
  attempt=$((attempt + 1))
  [ "$attempt" -le "$MAX_ATTEMPTS" ] && sleep "$SLEEP_SECONDS"
done

echo "serial_reconnect=FAIL reason=attempts_exhausted" >&2
exit 4
