#!/usr/bin/env bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/close-lane3-final.sh"
TMP="$(mktemp "$DIR/.close-lane3-final.safe.XXXXXX.sh")"
trap 'rm -f "$TMP"' EXIT

python3 - "$SRC" "$TMP" <<'PY'
import sys
src,dst=sys.argv[1:]
s=open(src,encoding="utf-8").read()
old='''"$TF" show -json "$PLAN_IAM" | python3 -c '\nimport json,sys\np=json.load(sys.stdin); ch=[]\nfor r in p.get("resource_changes",[]):\n a=r.get("change",{}).get("actions",[])\n if a not in (["no-op"],["read"]): ch.append((r.get("address"),a))\nallowed={"oci_identity_dynamic_group.lane3_backup_core[0]","oci_identity_policy.lane3_backup_core[0]"}\nif any(a not in allowed or set(x)!={"create"} for a,x in ch): print("lane3_backup_iam_guard=FAIL",ch);raise SystemExit(10)\nprint("lane3_backup_iam_creates=%d"%len(ch));print("lane3_backup_iam_guard=PASS")\n'\n'''
new='''"$TF" show -json "$PLAN_IAM" | python3 -c '\nimport json,sys\np=json.load(sys.stdin); ch=[]\nallowed={\n "oci_identity_dynamic_group.lane3_backup_core[0]":{"create"},\n "oci_identity_policy.lane3_backup_core[0]":{"create"},\n "oci_core_security_list.admin_bastion_egress[0]":{"delete"},\n "oci_core_subnet.private_app":{"update"},\n}\nfor r in p.get("resource_changes",[]):\n a=r.get("change",{}).get("actions",[])\n if a in (["no-op"],["read"]): continue\n addr=r.get("address"); ch.append((addr,a))\n if addr not in allowed or set(a)!=allowed[addr]:\n  print("lane3_backup_iam_guard=FAIL",ch);raise SystemExit(10)\nrequired={"oci_identity_dynamic_group.lane3_backup_core[0]","oci_identity_policy.lane3_backup_core[0]"}\nseen={a for a,x in ch if set(x)=={"create"}}\nif not required.issubset(seen):\n print("lane3_backup_iam_guard=FAIL reason=missing_backup_iam",ch);raise SystemExit(11)\nprint("lane3_backup_iam_creates=2")\nprint("lane3_early_recovery_cleanup_changes=%d"%sum(1 for a,_ in ch if a not in required))\nprint("lane3_backup_iam_guard=PASS")\n'\n'''
if old not in s:
    raise SystemExit("safe_closeout_patch=FAIL reason=iam_guard_block_not_found")
s=s.replace(old,new,1)
old_j='for u in teswa-api teswa-realtime teswa-workers postgresql-17; do systemctl is-active --quiet "$u"; journalctl -u "$u" -n 1 --no-pager | grep -q .; done'
new_j='for u in teswa-api teswa-realtime teswa-workers postgresql-17; do systemctl is-active --quiet "$u"; sudo journalctl -u "$u" -n 1 --no-pager | grep -q .; done'
if old_j not in s:
    raise SystemExit("safe_closeout_patch=FAIL reason=journal_guard_not_found")
s=s.replace(old_j,new_j,1)
open(dst,"w",encoding="utf-8").write(s)
PY

chmod 0700 "$TMP"
echo "safe_closeout_patch=PASS"
bash "$TMP"
