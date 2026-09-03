#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-core-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "teswa-core-01 is not RUNNING." >&2
  exit 2
}

SCRIPT_TEXT='set -u
printf "run_as_user=%s\n" "$(id -un)"
echo "TESWA PHASE 4 POSTGRES17 FAILURE DIAGNOSTIC"
echo "mutation=none_except_normal_read_caches"
echo "target=teswa-core-01"
echo

echo "[installed]"
rpm -q pgdg-redhat-repo postgresql17 postgresql17-server postgresql17-contrib 2>&1 || true

echo
echo "[repo_files]"
for f in /etc/yum.repos.d/pgdg-redhat-all.repo /etc/yum.repos.d/pgdg-redhat-all.repo.rpmnew; do
  if [ -f "$f" ]; then
    echo "file=$f"
    grep -E "^\[pgdg|^name=|^enabled=|^baseurl=|^gpgcheck=|^repo_gpgcheck=|^gpgkey=" "$f" | head -n 120 || true
  fi
done

echo
echo "[enabled_pgdg_repos]"
dnf -q repolist --enabled 2>&1 | grep -E "(^repo id|pgdg)" || true

echo
echo "[cached_candidates]"
for p in postgresql17 postgresql17-server postgresql17-contrib; do
  echo "package=$p"
  dnf -q --cacheonly repoquery --available --qf "%{name} %{epoch}:%{version}-%{release} %{arch} %{repoid}" "$p" 2>&1 | tail -n 12 || true
done

echo
echo "[module_state]"
dnf -q --cacheonly module list postgresql --all 2>&1 | tail -n 40 || true

echo
echo "[dnf_log_errors]"
if [ -r /var/log/dnf.log ]; then
  grep -Ei "postgresql17|pgdg|error|problem|gpg|nothing provides|conflict|cannot install" /var/log/dnf.log | tail -n 120 || true
else
  echo "dnf_log_unavailable=true"
fi

echo
echo "[dnf_history]"
dnf -q history list 2>&1 | head -n 20 || true

echo "postgres17_failure_diagnostic=PASS"'

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT

python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

echo "TESWA PHASE 4 POSTGRES17 FAILURE DIAGNOSTIC"
echo "guest_mutation=none_except_normal_read_caches"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "data_migration=none"

COMMAND_ID="$(oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 480 \
  --display-name "teswa-phase4-postgres17-diagnostic" \
  --query 'data.id' \
  --raw-output)"

elapsed=0
last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$STATE" != "$last_state" ]; then
    echo "run_command_state=$STATE"
    last_state="$STATE"
  fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code")); print((c.get("text") or "").rstrip())
'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("message=%s" % (c.get("message") or "")); print((c.get("text") or "").rstrip())
'
    exit 6
  fi
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "postgres17_failure_diagnostic=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
