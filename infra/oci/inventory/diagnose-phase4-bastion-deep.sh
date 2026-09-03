#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "diagnostic=FAIL reason=core_not_running" >&2
  exit 2
}

SCRIPT_TEXT='set -u

echo "TESWA CORE BASTION DEEP DIAGNOSTIC"
echo "mutation=none"
echo "user=$(id -un)"
echo "hostname=$(hostname)"

echo
echo "[packages]"
rpm -q oracle-cloud-agent openssh-server firewalld 2>/dev/null || true

echo
echo "[firewalld_static_config]"
for f in /etc/firewalld/zones/public.xml /usr/lib/firewalld/zones/public.xml; do
  if [ -r "$f" ]; then
    echo "--- $f"
    cat "$f"
  else
    echo "--- $f unreadable_or_absent"
  fi
done

echo
echo "[firewalld_ssh_service_refs]"
grep -R -n -E "<service[[:space:]]+name=[\"'\'' ]*ssh|<port[^>]*port=[\"'\'' ]*22"   /etc/firewalld /usr/lib/firewalld/zones 2>/dev/null | head -n 100 || true

echo
echo "[sshd_effective]"
if command -v sshd >/dev/null 2>&1; then
  sshd -T -C user=opc,addr=127.0.0.1,host=core01 2>&1     | grep -E "^(port|addressfamily|listenaddress|pubkeyauthentication|passwordauthentication|authorizedkeysfile|allowusers|denyusers|maxauthtries)"     | head -n 100 || true
fi

echo
echo "[bastion_plugin_paths]"
find /var/log/oracle-cloud-agent /var/lib/oracle-cloud-agent   -maxdepth 5   \( -iname "*bastion*" -o -path "*/bastion/*" \)   -print 2>/dev/null | head -n 200 || true

echo
echo "[readable_bastion_log_tail]"
found=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  [ -r "$f" ] || continue
  found=1
  echo "--- $f"
  tail -n 120 "$f" 2>/dev/null || true
done < <(find /var/log/oracle-cloud-agent /var/lib/oracle-cloud-agent   -maxdepth 6 -type f   \( -iname "*bastion*.log" -o -path "*/bastion/*" \)   2>/dev/null | head -n 20)
[ "$found" -eq 1 ] || echo "no_readable_bastion_logs_found"

echo
echo "[agent_log_bastion_refs]"
for f in /var/log/oracle-cloud-agent/agent.log /var/log/oracle-cloud-agent/agent.log.1; do
  [ -r "$f" ] || continue
  echo "--- $f"
  grep -i -E "bastion|ssh|session|error|fail" "$f" 2>/dev/null | tail -n 150 || true
done

echo
echo "[sshd_recent_journal]"
journalctl -u sshd --since "-30 min" --no-pager 2>&1 | tail -n 120 || true

echo
echo "diagnostic_complete=true"'

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT

python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({
        "source":{"sourceType":"TEXT","text":text},
        "output":{"outputType":"TEXT"}
    },f)
PY

python3 - "$target_file" "$CORE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

echo "TESWA PHASE 4 BASTION DEEP READ-ONLY DIAGNOSTIC"
echo "guest_mutation=none"
echo

COMMAND_ID="$(oci instance-agent command create   --compartment-id "$COMPARTMENT"   --content "file://$content_file"   --target "file://$target_file"   --timeout-in-seconds 180   --display-name "teswa-phase4-bastion-deep-diagnostic"   --query 'data.id'   --raw-output)"

elapsed=0
last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get     --command-id "$COMMAND_ID"     --instance-id "$CORE_ID"     --output json)"

  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))
')"

  if [ "$STATE" != "$last_state" ]; then
    echo "run_command_state=$STATE"
    last_state="$STATE"
  fi

  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code"))
print((c.get("text") or "").rstrip())
if c.get("exit-code") not in (0,None):
    raise SystemExit(5)
'
    exit 0
  fi

  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("message=%s" % (c.get("message") or ""))
print((c.get("text") or "").rstrip())
'
    exit 6
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "diagnostic=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
