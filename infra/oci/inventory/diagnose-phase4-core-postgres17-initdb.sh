#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "teswa-core-01 is not RUNNING." >&2; exit 2; }

SCRIPT_TEXT='set -u
echo "run_as_user=$(id -un)"
echo "TESWA POSTGRES17 INITDB DIAGNOSTIC"
echo "mutation=none"
echo
printf "marker_present="; sudo test -f /etc/teswa/phase4-postgres17-owned && echo true || echo false
printf "pg_version_present="; sudo test -f /var/lib/pgsql/17/data/PG_VERSION && echo true || echo false
printf "service_active="; systemctl is-active postgresql-17 2>/dev/null || true
printf "service_enabled="; systemctl is-enabled postgresql-17 2>/dev/null || true
echo
echo "[locale]"
locale 2>&1 || true
locale -a 2>&1 | head -n 40 || true
echo
echo "[pg_paths]"
sudo ls -ld /var/lib/pgsql /var/lib/pgsql/17 /var/lib/pgsql/17/data 2>&1 || true
sudo find /var/lib/pgsql/17/data -maxdepth 1 -mindepth 1 -printf "%f %u:%g %m\n" 2>&1 | sort | head -n 80 || true
echo
echo "[initdb_log]"
for f in /var/lib/pgsql/17/initdb.log /var/lib/pgsql/17/data/log/initdb.log; do
  if sudo test -f "$f"; then echo "file=$f"; sudo tail -n 120 "$f" 2>&1 || true; fi
done
echo
echo "[service_status]"
sudo systemctl status postgresql-17 --no-pager -l 2>&1 | tail -n 80 || true
echo
echo "[journal]"
sudo journalctl -u postgresql-17 -n 80 --no-pager 2>&1 || true
echo "postgres17_initdb_diagnostic=PASS"'

content_file="$(mktemp)"; target_file="$(mktemp)"; trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
p,t=sys.argv[1:]
with open(p,"w",encoding="utf-8") as f: json.dump({"source":{"sourceType":"TEXT","text":t},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
p,i=sys.argv[1:]
with open(p,"w",encoding="utf-8") as f: json.dump({"instanceId":i},f)
PY

echo "TESWA PHASE 4 POSTGRES17 INITDB DIAGNOSTIC"
echo "guest_mutation=none"
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 300 --display-name teswa-phase4-postgres17-initdb-diagnostic --query 'data.id' --raw-output)"
elapsed=0; last_state=""
while true; do
  J="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$S" != "$last_state" ]; then echo "run_command_state=$S"; last_state="$S"; fi
  if [ "$S" = SUCCEEDED ]; then printf '%s' "$J" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("data",{}).get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip())'; exit 0; fi
  if [ "$S" = FAILED ] || [ "$S" = TIMED_OUT ] || [ "$S" = CANCELED ]; then printf '%s' "$J" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("data",{}).get("content") or {}; print("message=%s"%(c.get("message") or "")); print((c.get("text") or "").rstrip())'; exit 6; fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "postgres17_initdb_diagnostic=FAIL reason=poll_timeout state=$S"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed+POLL_SECONDS))
done
