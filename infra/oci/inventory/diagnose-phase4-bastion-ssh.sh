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

echo "TESWA CORE BASTION SSH DIAGNOSTIC"
echo "mutation=none"
echo "user=$(id -un)"
echo "hostname=$(hostname)"

echo
echo "[sshd]"
systemctl is-active sshd 2>/dev/null || true
systemctl is-enabled sshd 2>/dev/null || true
ss -lnt 2>/dev/null | awk "NR==1 || \$4 ~ /:22$/"

echo
echo "[ssh_config_effective_sources]"
for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
  [ -r "$f" ] || continue
  echo "--- $f"
  grep -E "^[[:space:]]*(Port|ListenAddress|AddressFamily|PubkeyAuthentication|PasswordAuthentication|AuthorizedKeysFile|DenyUsers|DenyGroups)[[:space:]]" "$f" 2>/dev/null || true
done

echo
echo "[network]"
ip -br addr 2>/dev/null || true
ip route 2>/dev/null || true

echo
echo "[firewalld]"
systemctl is-active firewalld 2>/dev/null || true
systemctl is-enabled firewalld 2>/dev/null || true
firewall-cmd --get-active-zones 2>&1 || true
firewall-cmd --list-all 2>&1 || true

echo
echo "[local_tcp22_probe]"
python3 - <<'"'"'PY'"'"'
import socket
for host in ("127.0.0.1",):
    s=socket.socket()
    s.settimeout(2)
    try:
        s.connect((host,22))
        print(f"{host}:22=reachable")
    except Exception as e:
        print(f"{host}:22=unreachable:{type(e).__name__}")
    finally:
        s.close()
PY

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

echo "TESWA PHASE 4 BASTION SSH READ-ONLY DIAGNOSTIC"
echo "guest_mutation=none"
echo

COMMAND_ID="$(oci instance-agent command create   --compartment-id "$COMPARTMENT"   --content "file://$content_file"   --target "file://$target_file"   --timeout-in-seconds 180   --display-name "teswa-phase4-bastion-ssh-diagnostic"   --query 'data.id'   --raw-output)"

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
