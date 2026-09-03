#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"
POLL_SECONDS="${POLL_SECONDS:-15}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

echo "TESWA OCI PHASE 4 BOOTSTRAP PREFLIGHT"
echo "mode=read-only"
echo

get_instance_json() {
  local name="$1"
  oci compute instance list     --compartment-id "$COMPARTMENT"     --display-name "$name"     --all     --output json
}

check_instance() {
  local name="$1"
  local raw id state management_disabled monitoring_disabled all_plugins_disabled

  raw="$(get_instance_json "$name")"

  readarray -t I < <(
    printf '%s' "$raw" | python3 -c '
import json,sys
name=sys.argv[1]
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
if len(rows)!=1:
    print("")
    print("")
    print("")
    print("")
    print("")
    raise SystemExit(0)
x=rows[0]
a=x.get("agent-config") or {}
print(x.get("id",""))
print(x.get("lifecycle-state",""))
print(str(a.get("is-management-disabled")).lower())
print(str(a.get("is-monitoring-disabled")).lower())
print(str(a.get("are-all-plugins-disabled")).lower())
' "$name"
  )

  id="${I[0]:-}"
  state="${I[1]:-}"
  management_disabled="${I[2]:-}"
  monitoring_disabled="${I[3]:-}"
  all_plugins_disabled="${I[4]:-}"

  [ -n "$id" ] || { echo "instance=$name verify=FAIL reason=not_found_or_duplicate"; return 1; }

  echo "instance=$name state=$state management_disabled=$management_disabled monitoring_disabled=$monitoring_disabled all_plugins_disabled=$all_plugins_disabled"

  if [ "$state" != "RUNNING" ] || [ "$management_disabled" = "true" ] || [ "$all_plugins_disabled" = "true" ]; then
    echo "instance=$name agent_config=FAIL"
    return 1
  fi

  local elapsed=0
  while true; do
    set +e
    PLUGINS="$(oci instance-agent plugin list       --compartment-id "$COMPARTMENT"       --instanceagent-id "$id"       --all       --output json 2>/tmp/teswa-phase4-plugin.err)"
    RC=$?
    set -e

    if [ "$RC" -eq 0 ] && [ -n "$(printf '%s' "$PLUGINS" | tr -d '[:space:]')" ]; then
      RESULT="$(printf '%s' "$PLUGINS" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
wanted=["Compute Instance Run Command","Compute Instance Monitoring"]
by_name={x.get("name"):x.get("status") for x in rows}
for n in wanted:
    print("%s=%s" % (n.replace(" ","_").lower(), by_name.get(n,"MISSING")))
ok=by_name.get("Compute Instance Run Command")=="RUNNING" and by_name.get("Compute Instance Monitoring")=="RUNNING"
print("ready=true" if ok else "ready=false")
')"
      printf '%s\n' "$RESULT"

      if printf '%s\n' "$RESULT" | grep -q '^ready=true$'; then
        echo "instance=$name bootstrap_agent_ready=true"
        return 0
      fi
    fi

    if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
      echo "instance=$name bootstrap_agent_ready=false"
      if [ -s /tmp/teswa-phase4-plugin.err ]; then
        echo "last_plugin_cli_error:"
        tail -n 20 /tmp/teswa-phase4-plugin.err
      fi
      return 1
    fi

    sleep "$POLL_SECONDS"
    elapsed=$((elapsed + POLL_SECONDS))
  done
}

check_instance "teswa-core-01"
echo
check_instance "teswa-edge-01"

echo
echo "phase4_preflight=PASS"
echo "No OCI resources or guest OS state were changed."
