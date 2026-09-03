#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

if [ "${TESWA_ALLOW_CORE_PREREQS:-}" != "YES" ]; then
  echo "Refusing guest mutation: set TESWA_ALLOW_CORE_PREREQS=YES." >&2
  exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

INSTANCE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "teswa-core-01 is not RUNNING." >&2
  exit 3
}

SCRIPT_TEXT='set -Eeuo pipefail

echo "run_as_user=$(id -un)"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1 && sudo -n true; then
  SUDO="sudo"
else
  echo "baseline=FAIL reason=no_privileged_execution"
  exit 10
fi

echo "TESWA CORE RUNTIME PREREQUISITES"
echo "target=teswa-core-01"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"

mem_kb="$(awk "/MemTotal:/ {print \$2}" /proc/meminfo)"
root_free_kb="$(df -Pk / | awk "NR==2 {print \$4}")"

if [ "$mem_kb" -lt 4000000 ]; then
  echo "prereq=FAIL reason=unexpected_core_memory"
  exit 11
fi

if [ "$root_free_kb" -lt 10000000 ]; then
  echo "prereq=FAIL reason=insufficient_root_free_space"
  exit 12
fi

if command -v getenforce >/dev/null 2>&1; then
  mode="$(getenforce)"
  echo "selinux=$mode"
  [ "$mode" = "Enforcing" ] || { echo "prereq=FAIL reason=selinux_not_enforcing"; exit 13; }
fi

if systemctl is-active --quiet firewalld; then
  echo "firewalld=active"
else
  echo "prereq=FAIL reason=firewalld_not_active"
  exit 14
fi

$SUDO dnf -y install ca-certificates curl jq tar gzip unzip git podman

echo
echo "[versions]"
curl --version | head -n1
git --version
jq --version
podman --version
python3 --version

echo
echo "[post_install]"
echo "root_free=$(df -hP / | awk "NR==2 {print \$4}")"
echo "podman_installed=true"
echo "reboot_requested=false"
echo "core_prereqs=PASS"'

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

python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

echo "TESWA PHASE 4 CORE PREREQUISITES APPLY"
echo "mutation=core_packages_only"
echo "packages=ca-certificates,curl,jq,tar,gzip,unzip,git,podman"
echo "automatic_reboot=false"
echo

COMMAND_ID="$(oci instance-agent command create   --compartment-id "$COMPARTMENT"   --content "file://$content_file"   --target "file://$target_file"   --timeout-in-seconds 1200   --display-name "teswa-phase4-core-prereqs"   --query 'data.id'   --raw-output)"

elapsed=0
last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get     --command-id "$COMMAND_ID"     --instance-id "$INSTANCE_ID"     --output json)"

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
    echo "core_prereqs=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
