#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-10}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-300}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
if [ "${TESWA_ALLOW_EDGE_RUN_COMMAND_RESTART:-}" != "YES" ]; then
  echo "Refusing control-plane mutation: set TESWA_ALLOW_EDGE_RUN_COMMAND_RESTART=YES." >&2
  exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] || { echo "phase8_run_command_restart=FAIL reason=edge_not_running" >&2; exit 3; }

base="$(mktemp)"
disabled="$(mktemp)"
enabled="$(mktemp)"
trap 'rm -f "$base" "$disabled" "$enabled"' EXIT

oci compute instance get --instance-id "$EDGE_ID" --query 'data."agent-config"' --output json > "$base"

python3 - "$base" "$disabled" "$enabled" <<'PY'
import json,sys
src,disabled_path,enabled_path=sys.argv[1:]
r=json.load(open(src,encoding="utf-8"))

def pick(*names, default=None):
    for n in names:
        if n in r and r[n] is not None:
            return r[n]
    return default

plugins=pick("plugins-config","pluginsConfig",default=[]) or []
normalized=[]
for p in plugins:
    name=p.get("name")
    state=p.get("desired-state",p.get("desiredState"))
    if name and state:
        normalized.append({"name":name,"desiredState":state})

base_cfg={
    "areAllPluginsDisabled": bool(pick("are-all-plugins-disabled","areAllPluginsDisabled",default=False)),
    "isMonitoringDisabled": bool(pick("is-monitoring-disabled","isMonitoringDisabled",default=False)),
    "pluginsConfig": normalized,
}
if base_cfg["areAllPluginsDisabled"]:
    raise SystemExit("all plugins are globally disabled; refusing")

for path,flag in ((disabled_path,True),(enabled_path,False)):
    cfg=dict(base_cfg)
    cfg["isManagementDisabled"]=flag
    with open(path,"w",encoding="utf-8") as f:
        json.dump(cfg,f,separators=(",",":"))
PY

plugin_status() {
  oci instance-agent plugin list \
    --compartment-id "$COMPARTMENT" \
    --instanceagent-id "$EDGE_ID" \
    --all --output json | \
  python3 -c 'import json,sys; xs=json.load(sys.stdin).get("data",[]); m=[x for x in xs if x.get("name")=="Compute Instance Run Command"]; print(m[0].get("status","") if m else "NOT_FOUND")'
}

wait_for_status() {
  want="$1"
  elapsed=0
  while true; do
    got="$(plugin_status)"
    echo "run_command_plugin_status=$got"
    [ "$got" = "$want" ] && return 0
    [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || return 1
    sleep "$POLL_SECONDS"
    elapsed=$((elapsed + POLL_SECONDS))
  done
}

restore_enabled() {
  oci compute instance update --instance-id "$EDGE_ID" --agent-config "file://$enabled" --force >/dev/null 2>&1 || true
}

current="$(plugin_status)"
echo "TESWA PHASE 8 EDGE RUN COMMAND PLUGIN RESTART"
echo "mutation=agent_config_management_toggle_only"
echo "target=teswa-edge-01"
echo "current_run_command_status=$current"
echo "instance_reboot=none"
echo "ssh_change=none"
echo "network_change=none"
echo "terraform_resource_change=none"
[ "$current" = "RUNNING" ] || { echo "phase8_run_command_restart=FAIL reason=plugin_not_running_before_toggle status=$current"; exit 4; }

# Stop management plugins through the supported instance agentConfig switch.
oci compute instance update --instance-id "$EDGE_ID" --agent-config "file://$disabled" --force >/dev/null
if ! wait_for_status STOPPED; then
  restore_enabled
  echo "phase8_run_command_restart=FAIL reason=plugin_did_not_stop"
  exit 5
fi

# Restore the original management-enabled state.
oci compute instance update --instance-id "$EDGE_ID" --agent-config "file://$enabled" --force >/dev/null
if ! wait_for_status RUNNING; then
  restore_enabled
  echo "phase8_run_command_restart=FAIL reason=plugin_did_not_restart"
  exit 6
fi

echo "final_run_command_status=RUNNING"
echo "management_enabled_restored=true"
echo "phase8_run_command_restart=PASS"
