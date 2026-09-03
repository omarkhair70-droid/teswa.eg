#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "diagnostic=FAIL reason=core_not_running" >&2
  exit 2
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

oci compute instance get   --instance-id "$CORE_ID"   --output json >"$TMP"

python3 - "$TMP" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as f:
    d=json.load(f).get("data",{})

md=d.get("metadata") or {}
ssh=md.get("ssh_authorized_keys") or ""
ud=md.get("user_data") or ""

print("TESWA PHASE 4 CORE SSH LAUNCH-METADATA DIAGNOSTIC")
print("mutation=none")
print("ssh_authorized_keys_present="+str(bool(ssh.strip())).lower())
print("ssh_authorized_keys_nonempty_lines="+str(len([x for x in ssh.splitlines() if x.strip()])))
print("user_data_present="+str(bool(ud.strip())).lower())
print("diagnostic=PASS")
PY
