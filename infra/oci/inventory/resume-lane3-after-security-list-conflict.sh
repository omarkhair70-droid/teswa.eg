#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
[ "${TESWA_ALLOW_LANE3_CLOSEOUT:-}" = "YES" ] || { echo "lane3_resume=FAIL reason=confirmation_missing"; exit 2; }
[ -x "$TF" ] || { echo "lane3_resume=FAIL reason=terraform_missing"; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "lane3_resume=FAIL reason=oci_cli_missing"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "lane3_resume=FAIL reason=python_missing"; exit 1; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TFDIR="$(cd "$DIR/../terraform" && pwd)"
cd "$TFDIR"

STATE="$(mktemp)"
trap 'rm -f "$STATE"' EXIT
"$TF" state pull > "$STATE"

eval "$(python3 - "$STATE" <<'PY'
import json,shlex,sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
def rid(t,n):
    for r in p.get('resources',[]):
        if r.get('type')==t and r.get('name')==n:
            for i in r.get('instances',[]):
                a=i.get('attributes') or {}
                if a.get('id'): return a['id']
    return ''
print('SUBNET_ID='+shlex.quote(rid('oci_core_subnet','private_app')))
print('EMPTY_SL_ID='+shlex.quote(rid('oci_core_security_list','empty')))
print('TEMP_SL_ID='+shlex.quote(rid('oci_core_security_list','admin_bastion_egress')))
PY
)"

[ -n "$SUBNET_ID" ] || { echo "lane3_resume=FAIL reason=private_app_subnet_missing_from_state"; exit 3; }
[ -n "$EMPTY_SL_ID" ] || { echo "lane3_resume=FAIL reason=empty_security_list_missing_from_state"; exit 3; }

echo "TESWA LANE 3 RESUME AFTER SECURITY LIST CONFLICT"
echo "subnet_id=$SUBNET_ID"
echo "production_cutover=none"
echo "dns_change=none"

if [ -z "$TEMP_SL_ID" ]; then
  echo "temporary_security_list_state=already_absent"
else
  NAME="$(oci network security-list get --security-list-id "$TEMP_SL_ID" --query 'data."display-name"' --raw-output 2>/dev/null || true)"
  [ "$NAME" = "teswa-admin-bastion-egress" ] || {
    echo "lane3_resume=FAIL reason=unexpected_security_list_identity name=$NAME"; exit 4;
  }

  LIVE_IDS="$(oci network subnet get --subnet-id "$SUBNET_ID" --query 'data."security-list-ids"' --output json)"
  UPDATED="$(python3 - "$LIVE_IDS" "$EMPTY_SL_ID" "$TEMP_SL_ID" <<'PY'
import json,sys
ids=json.loads(sys.argv[1]); empty,temp=sys.argv[2:]
if not isinstance(ids,list): raise SystemExit('live security-list-ids is not a list')
unexpected=[x for x in ids if x not in {empty,temp}]
if unexpected: raise SystemExit('unexpected security list ids: '+repr(unexpected))
if empty not in ids: raise SystemExit('canonical empty security list is not attached')
print(json.dumps([x for x in ids if x != temp],separators=(',',':')))
PY
)"

  if python3 - "$LIVE_IDS" "$TEMP_SL_ID" <<'PY'
import json,sys
raise SystemExit(0 if sys.argv[2] in json.loads(sys.argv[1]) else 1)
PY
  then
    echo "temporary_security_list_attached=true"
    echo "action=detach_temporary_security_list_first"
    oci network subnet update \
      --subnet-id "$SUBNET_ID" \
      --security-list-ids "$UPDATED" \
      --force \
      --wait-for-state AVAILABLE >/dev/null
  else
    echo "temporary_security_list_attached=false"
  fi

  for _ in $(seq 1 30); do
    NOW="$(oci network subnet get --subnet-id "$SUBNET_ID" --query 'data."security-list-ids"' --output json)"
    if python3 - "$NOW" "$EMPTY_SL_ID" "$TEMP_SL_ID" <<'PY'
import json,sys
ids=json.loads(sys.argv[1]); empty,temp=sys.argv[2:]
raise SystemExit(0 if ids==[empty] and temp not in ids else 1)
PY
    then
      echo "subnet_security_list_detach=PASS"
      break
    fi
    sleep 5
  done

  NOW="$(oci network subnet get --subnet-id "$SUBNET_ID" --query 'data."security-list-ids"' --output json)"
  python3 - "$NOW" "$EMPTY_SL_ID" "$TEMP_SL_ID" <<'PY'
import json,sys
ids=json.loads(sys.argv[1]); empty,temp=sys.argv[2:]
if ids != [empty] or temp in ids:
    print('lane3_resume=FAIL reason=subnet_detach_not_converged live='+repr(ids))
    raise SystemExit(5)
PY
fi

echo "ordering_repair=PASS"
echo "resume_target=close-lane3-final-safe.sh"
cd "$DIR/../.." >/dev/null 2>&1 || true
exec bash "$DIR/close-lane3-final-safe.sh"
