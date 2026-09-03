#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-300}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

SCRIPT_TEXT='set -u
echo "=== TESWA OS INVENTORY ==="
echo "timestamp_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "hostname=$(hostname)"
echo
echo "[os]"
if [ -r /etc/os-release ]; then
  grep -E "^(NAME|VERSION|ID|VERSION_ID)=" /etc/os-release || true
fi
uname -srmo || true
echo
echo "[cpu_memory]"
echo "nproc=$(nproc 2>/dev/null || echo unknown)"
free -h 2>/dev/null || true
echo
echo "[filesystem]"
df -hT / 2>/dev/null || true
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS 2>/dev/null || true
echo
echo "[security]"
getenforce 2>/dev/null || echo "selinux=unavailable"
systemctl is-active firewalld 2>/dev/null || true
systemctl is-enabled firewalld 2>/dev/null || true
echo
echo "[runtime_presence]"
for c in podman docker node npm pnpm bun python3 psql postgres caddy nginx; do
  if command -v "$c" >/dev/null 2>&1; then
    printf "%s=" "$c"
    "$c" --version 2>/dev/null | head -n1 || echo present
  else
    echo "$c=absent"
  fi
done
echo
echo "[services_listening]"
ss -lnt 2>/dev/null | head -n 50 || true
echo
echo "[package_manager]"
if command -v dnf >/dev/null 2>&1; then
  echo "dnf=present"
  rpm -q dnf 2>/dev/null || true
else
  echo "dnf=absent"
fi
echo
echo "inventory_complete=true"'

get_instance_id() {
  local name="$1"
  local raw
  raw="$(oci compute instance list     --compartment-id "$COMPARTMENT"     --display-name "$name"     --all     --output json)"

  printf '%s' "$raw" | python3 -c '
import json,sys
name=sys.argv[1]
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state")=="RUNNING"]
if len(rows)!=1:
    raise SystemExit("expected exactly one RUNNING instance named %s" % name)
print(rows[0]["id"])
' "$name"
}

run_inventory() {
  local name="$1"
  local instance_id content_file target_file command_id elapsed exec_json state

  instance_id="$(get_instance_id "$name")"
  content_file="$(mktemp)"
  target_file="$(mktemp)"
  trap 'rm -f "$content_file" "$target_file"' RETURN

  python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({
        "source":{"sourceType":"TEXT","text":text},
        "output":{"outputType":"TEXT"}
    },f)
PY

  python3 - "$target_file" "$instance_id" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

  echo "=== $name ==="

  command_id="$(oci instance-agent command create     --compartment-id "$COMPARTMENT"     --content "file://$content_file"     --target "file://$target_file"     --timeout-in-seconds 180     --display-name "teswa-phase4-os-inventory"     --query 'data.id'     --raw-output)"

  elapsed=0
  while true; do
    exec_json="$(oci instance-agent command-execution get       --command-id "$command_id"       --instance-id "$instance_id"       --output json)"

    state="$(printf '%s' "$exec_json" | python3 -c '
import json,sys
print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))
')"

    if [ "$state" = "SUCCEEDED" ]; then
      printf '%s' "$exec_json" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("run_command_state=%s" % d.get("lifecycle-state"))
print("exit_code=%s" % c.get("exit-code"))
text=c.get("text") or ""
print(text.rstrip())
if c.get("exit-code") not in (0,None):
    raise SystemExit(5)
'
      echo
      return 0
    fi

    if [ "$state" = "FAILED" ] || [ "$state" = "TIMED_OUT" ] || [ "$state" = "CANCELED" ]; then
      echo "run_command_state=$state"
      printf '%s' "$exec_json" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("message=%s" % (c.get("message") or ""))
print((c.get("text") or "").rstrip())
'
      return 6
    fi

    if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
      echo "run_command_state=$state"
      echo "inventory=FAIL reason=poll_timeout"
      return 7
    fi

    sleep "$POLL_SECONDS"
    elapsed=$((elapsed + POLL_SECONDS))
  done
}

echo "TESWA OCI PHASE 4 READ-ONLY OS INVENTORY"
echo "guest_mutation=none"
echo

run_inventory "teswa-core-01"
run_inventory "teswa-edge-01"

echo "phase4_os_inventory=PASS"
echo "No packages, files, users, firewall rules, or services were changed."
