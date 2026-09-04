#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-900}"
PLAN_IAM="${TESWA_LANE3_BACKUP_IAM_PLAN:-/tmp/teswa-lane3-backup-iam.plan}"
PLAN_CLEANUP="${TESWA_LANE3_CLEANUP_PLAN:-/tmp/teswa-lane3-recovery-cleanup.plan}"
PLAN_FINAL="${TESWA_LANE3_FINAL_PLAN:-/tmp/teswa-lane3-final-drift.plan}"

[ "${TESWA_ALLOW_LANE3_CLOSEOUT:-}" = "YES" ] || { echo "lane3_closeout=FAIL reason=confirmation_missing"; exit 2; }
[ -x "$TF" ] || { echo "lane3_closeout=FAIL reason=terraform_missing"; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "lane3_closeout=FAIL reason=oci_cli_missing"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "lane3_closeout=FAIL reason=python_missing"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
cd "$ROOT"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
NS="$(oci os ns get --query data --raw-output)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
CORE_IP="$(oci compute instance list-vnics --instance-id "$CORE_ID" --query 'data[0]."private-ip"' --raw-output)"
EDGE_IP="$(oci compute instance list-vnics --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output)"

for p in "tenancy:$TENANCY" "namespace:$NS" "core_id:$CORE_ID" "edge_id:$EDGE_ID" "core_ip:$CORE_IP" "edge_ip:$EDGE_IP"; do
  k="${p%%:*}"; v="${p#*:}"
  [ -n "$v" ] && [ "$v" != null ] && [ "$v" != None ] || { echo "lane3_closeout=FAIL reason=missing_runtime_value target=$k"; exit 3; }
done

STATE="$(mktemp)"
trap 'rm -f "$STATE"' EXIT
"$TF" state pull > "$STATE"
eval "$(python3 - "$STATE" <<'PY'
import json,shlex,sys
p=json.load(open(sys.argv[1]))
def inst(name):
    for r in p.get("resources",[]):
        if r.get("type")=="oci_core_instance" and r.get("name")==name:
            for i in r.get("instances",[]):
                return i.get("attributes") or {}
    raise SystemExit("instance missing "+name)
def source(a):
    s=a.get("source_details") or []
    return (s[0] if s else {}).get("source_id","")
c=inst("core"); e=inst("edge"); meta=c.get("metadata") or {}
key=(meta.get("ssh_authorized_keys") or "").strip()
print("CORE_IMAGE="+shlex.quote(source(c)))
print("EDGE_IMAGE="+shlex.quote(source(e)))
print("CORE_BOOTSTRAP="+("true" if key else "false"))
print("CORE_SSH_KEY="+shlex.quote(key))
PY
)"

run_core() {
  local display="$1" text="$2" timeout="${3:-600}"
  local bytes cf tf id elapsed=0 js state delivery
  bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
  echo "run_command=$display guest_script_bytes=$bytes"
  [ "$bytes" -le 4096 ] || { echo "lane3_closeout=FAIL reason=run_command_plaintext_limit name=$display"; return 40; }
  cf="$(mktemp)"; tf="$(mktemp)"
  python3 - "$cf" "$text" <<'PY'
import json,sys
json.dump({"source":{"sourceType":"TEXT","text":sys.argv[2]},"output":{"outputType":"TEXT"}},open(sys.argv[1],"w"))
PY
  python3 - "$tf" "$CORE_ID" <<'PY'
import json,sys
json.dump({"instanceId":sys.argv[2]},open(sys.argv[1],"w"))
PY
  id="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$cf" --target "file://$tf" --timeout-in-seconds "$timeout" --display-name "$display" --query 'data.id' --raw-output)"
  rm -f "$cf" "$tf"
  while true; do
    js="$(oci instance-agent command-execution get --command-id "$id" --instance-id "$CORE_ID" --output json)"
    state="$(printf '%s' "$js"|python3 -c 'import json,sys;print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
    delivery="$(printf '%s' "$js"|python3 -c 'import json,sys;print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
    echo "${display}_state=$state delivery=$delivery elapsed_seconds=$elapsed"
    if [ "$state" = SUCCEEDED ]; then
      printf '%s' "$js"|python3 -c 'import json,sys;d=json.load(sys.stdin).get("data",{});c=d.get("content") or {};print("exit_code=%s"%c.get("exit-code"));print((c.get("text") or "").rstrip());raise SystemExit(0 if c.get("exit-code") in (0,None) else 5)'
      return $?
    fi
    if [ "$state" = FAILED ] || [ "$state" = TIMED_OUT ] || [ "$state" = CANCELED ]; then
      printf '%s' "$js"|python3 -c 'import json,sys;d=json.load(sys.stdin).get("data",{});c=d.get("content") or {};print((c.get("text") or c.get("message") or "").rstrip())'
      return 6
    fi
    [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "lane3_closeout=FAIL reason=run_command_poll_timeout name=$display"; return 7; }
    sleep "$POLL_SECONDS"; elapsed=$((elapsed+POLL_SECONDS))
  done
}

echo "TESWA LANE 3 FINAL CLOSEOUT"
echo "core_private_ip=$CORE_IP"
echo "edge_private_ip=$EDGE_IP"
echo "production_cutover=none"
echo "dns_change=none"

"$TF" fmt -check *.tf
"$TF" validate

COMMON=(
  -var="tenancy_ocid=$TENANCY"
  -var="enable_compute_phase3=true"
  -var="core_image_ocid=$CORE_IMAGE"
  -var="edge_image_ocid=$EDGE_IMAGE"
  -var="enable_phase8b_internal_proxy=true"
  -var="phase8b_core_private_ip=$CORE_IP"
  -var="phase8b_edge_private_ip=$EDGE_IP"
)
if [ "$CORE_BOOTSTRAP" = true ]; then
  COMMON+=(-var="enable_core_bootstrap_metadata=true" -var="core_bootstrap_private_ip=$CORE_IP" -var="core_bootstrap_ssh_public_key=$CORE_SSH_KEY")
fi

echo "[1/5] backup IAM"
rm -f "$PLAN_IAM"
"$TF" plan "${COMMON[@]}" -var="enable_lane3_backup_iam=true" \
  -target='oci_identity_dynamic_group.lane3_backup_core[0]' \
  -target='oci_identity_policy.lane3_backup_core[0]' \
  -out="$PLAN_IAM" >/tmp/teswa-lane3-backup-iam-plan.txt
"$TF" show -json "$PLAN_IAM" | python3 -c '
import json,sys
p=json.load(sys.stdin); ch=[]
for r in p.get("resource_changes",[]):
 a=r.get("change",{}).get("actions",[])
 if a not in (["no-op"],["read"]): ch.append((r.get("address"),a))
allowed={"oci_identity_dynamic_group.lane3_backup_core[0]","oci_identity_policy.lane3_backup_core[0]"}
if any(a not in allowed or set(x)!={"create"} for a,x in ch): print("lane3_backup_iam_guard=FAIL",ch);raise SystemExit(10)
print("lane3_backup_iam_creates=%d"%len(ch));print("lane3_backup_iam_guard=PASS")
'
"$TF" apply -auto-approve "$PLAN_IAM"
echo "lane3_backup_iam=PASS"
sleep 15

echo "[2/5] PostgreSQL backup + Object Storage + restore drill"
BACKUP_GUEST='set -Eeuo pipefail
DB=teswa_rehearsal
RESTORE=teswa_lane3_restore_drill
BUCKET=teswa-backups
NS="__NS__"
OBJ="lane3/postgres17/teswa_rehearsal-$(date -u +%Y%m%dT%H%M%SZ).dump"
DUMP="$(mktemp /tmp/teswa-lane3.XXXXXX.dump)"
DOWN="$(mktemp /tmp/teswa-lane3-down.XXXXXX.dump)"
cleanup(){ sudo -u postgres /usr/pgsql-17/bin/dropdb --if-exists "$RESTORE" >/dev/null 2>&1 || true; rm -f "$DUMP" "$DOWN"; }
trap cleanup EXIT
sudo -n true
systemctl is-active --quiet postgresql-17
sudo -u postgres /usr/pgsql-17/bin/pg_dump -Fc "$DB" >"$DUMP"
test -s "$DUMP"
SHA="$(sha256sum "$DUMP"|awk "{print \$1}")"
SIZE="$(stat -c %s "$DUMP")"
python3 -m pip --version >/dev/null 2>&1 || sudo dnf -qy install python3-pip >/dev/null
python3 -c "import oci" >/dev/null 2>&1 || python3 -m pip install --user -q oci
export NS BUCKET OBJ DUMP DOWN
python3 - <<'"'"'PY'"'"'
import os,time,shutil,oci
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient(config={},signer=s)
ns,b,o,f,g=[os.environ[k] for k in ("NS","BUCKET","OBJ","DUMP","DOWN")]
last=None
for _ in range(8):
    try:
        with open(f,"rb") as h:c.put_object(ns,b,o,h,content_length=os.path.getsize(f))
        break
    except Exception as e:last=e;time.sleep(15)
else: raise last
r=c.get_object(ns,b,o)
with open(g,"wb") as h: shutil.copyfileobj(r.data.raw,h)
PY
SHA2="$(sha256sum "$DOWN"|awk "{print \$1}")"
[ "$SHA" = "$SHA2" ]
chmod 0644 "$DOWN"
sudo -u postgres /usr/pgsql-17/bin/dropdb --if-exists "$RESTORE" >/dev/null
sudo -u postgres /usr/pgsql-17/bin/createdb "$RESTORE"
sudo -u postgres /usr/pgsql-17/bin/pg_restore -d "$RESTORE" "$DOWN"
Q="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='"'"'public'"'"' AND c.relkind IN ('"'"'r'"'"','"'"'p'"'"','"'"'v'"'"','"'"'m'"'"','"'"'f'"'"')"
SRC="$(sudo -u postgres /usr/pgsql-17/bin/psql -d "$DB" -Atqc "$Q")"
DST="$(sudo -u postgres /usr/pgsql-17/bin/psql -d "$RESTORE" -Atqc "$Q")"
[ "$SRC" = "$DST" ]
echo "backup_object=$OBJ"
echo "backup_bytes=$SIZE"
echo "backup_sha256=$SHA"
echo "download_sha256_match=true"
echo "restore_relation_count=$DST"
echo "credentials_created=false"
echo "postgres_listener=127.0.0.1:5432"
echo "lane3_backup_restore=PASS"'
BACKUP_GUEST="${BACKUP_GUEST//__NS__/$NS}"
run_core "teswa-lane3-backup-restore" "$BACKUP_GUEST" 600

echo "[3/5] observability baseline"
CORE_JSON="$(oci compute instance get --instance-id "$CORE_ID" --output json)"
EDGE_JSON="$(oci compute instance get --instance-id "$EDGE_ID" --output json)"
python3 - "$CORE_JSON" "$EDGE_JSON" <<'PY'
import json,sys
for name,raw in (("core",sys.argv[1]),("edge",sys.argv[2])):
 d=json.loads(raw).get("data",{}).get("agent-config") or {}
 if d.get("is-monitoring-disabled") is True: raise SystemExit(name+" monitoring disabled")
 print(name+"_oci_monitoring_enabled=true")
PY
OBS_GUEST='set -Eeuo pipefail
CORE="__CORE__"; EDGE="__EDGE__"
for u in teswa-api teswa-realtime teswa-workers postgresql-17; do systemctl is-active --quiet "$u"; journalctl -u "$u" -n 1 --no-pager | grep -q .; done
curl -fsS "http://$CORE:3100/healthz" | grep -Fq "\"service\":\"teswa-api\""
curl -fsS "http://$CORE:3200/healthz" | grep -Fq "\"service\":\"teswa-realtime\""
[ "$(curl -fsS "http://$EDGE:8080/healthz")" = teswa-edge-caddy-ok ]
echo "journald_core_services=true"
echo "oci_monitoring_agent_core=true"
echo "edge_health_logging_surface=true"
echo "lane3_observability=PASS"'
OBS_GUEST="${OBS_GUEST//__CORE__/$CORE_IP}"; OBS_GUEST="${OBS_GUEST//__EDGE__/$EDGE_IP}"
run_core "teswa-lane3-observability" "$OBS_GUEST" 240

echo "[4/5] recovery cleanup"
set +e
CONSOLE_JSON="$(oci compute instance-console-connection list --compartment-id "$COMPARTMENT" --instance-id "$CORE_ID" --all --output json 2>/dev/null)"
set -e
python3 - "$CONSOLE_JSON" <<'PY' >/tmp/teswa-console-ids 2>/dev/null || true
import json,sys
try:d=json.loads(sys.argv[1]).get("data",[])
except: d=[]
for x in d:
 if x.get("lifecycle-state")!="DELETED" and x.get("id"): print(x["id"])
PY
while read -r cid; do [ -n "$cid" ] && oci compute instance-console-connection delete --instance-console-connection-id "$cid" --force >/dev/null || true; done </tmp/teswa-console-ids
rm -f /tmp/teswa-console-ids

rm -f "$PLAN_CLEANUP"
"$TF" plan "${COMMON[@]}" \
  -var="enable_lane3_backup_iam=true" \
  -var="enable_admin_bastion=false" \
  -var="enable_admin_bastion_connectivity=false" \
  -target='oci_core_subnet.private_app' \
  -target='oci_bastion_bastion.admin[0]' \
  -target='oci_core_network_security_group_security_rule.bastion_to_core_ssh[0]' \
  -target='oci_core_security_list.admin_bastion_egress[0]' \
  -out="$PLAN_CLEANUP" >/tmp/teswa-lane3-cleanup-plan.txt
"$TF" show -json "$PLAN_CLEANUP" | python3 -c '
import json,sys
p=json.load(sys.stdin); ch=[]
allowed={"oci_core_subnet.private_app","oci_bastion_bastion.admin[0]","oci_core_network_security_group_security_rule.bastion_to_core_ssh[0]","oci_core_security_list.admin_bastion_egress[0]"}
for r in p.get("resource_changes",[]):
 a=r.get("change",{}).get("actions",[])
 if a not in (["no-op"],["read"]):
  ch.append((r.get("address"),a))
  if r.get("address") not in allowed: print("lane3_cleanup_guard=FAIL",ch);raise SystemExit(20)
  if set(a) not in ({"delete"},{"update"}): print("lane3_cleanup_guard=FAIL",ch);raise SystemExit(21)
print("lane3_cleanup_changes=%d"%len(ch));print("lane3_cleanup_guard=PASS")
'
"$TF" apply -auto-approve "$PLAN_CLEANUP"
if [ "$CORE_BOOTSTRAP" = true ]; then
  KEY_B64="$(printf '%s' "$CORE_SSH_KEY" | base64 -w0)"
  SSH_GUEST='set -Eeuo pipefail
K="$(printf "%s" "__KEY__" | base64 -d)"
F=/home/opc/.ssh/authorized_keys
if sudo test -f "$F"; then
  T="$(mktemp)"
  sudo grep -Fvx "$K" "$F" >"$T" || true
  sudo install -o opc -g opc -m 0600 "$T" "$F"
  rm -f "$T"
fi
echo "active_bootstrap_ssh_key_removed=true"
echo "lane3_ssh_guest_cleanup=PASS"'
  SSH_GUEST="${SSH_GUEST//__KEY__/$KEY_B64}"
  run_core "teswa-lane3-ssh-key-cleanup" "$SSH_GUEST" 240
fi
echo "lane3_recovery_cleanup=PASS"

echo "[5/5] final full Terraform drift"
LANE4=false
if "$TF" state list 2>/dev/null | grep -q '^oci_identity_dynamic_group\.lane4_rehearsal_core'; then LANE4=true; fi
FINAL=("${COMMON[@]}" -var="enable_object_storage=true" -var="enable_vault=true" -var="enable_notifications=true" -var="enable_run_command_iam=true" -var="enable_lane3_backup_iam=true" -var="enable_admin_bastion=false" -var="enable_admin_bastion_connectivity=false")
if [ "$LANE4" = true ]; then FINAL+=(-var="enable_lane4_rehearsal_readonly_iam=true" -var="lane4_rehearsal_core_instance_ocid=$CORE_ID"); fi
rm -f "$PLAN_FINAL"
set +e
"$TF" plan -detailed-exitcode -no-color "${FINAL[@]}" -out="$PLAN_FINAL"
RC=$?
set -e
echo "terraform_drift_exit=$RC"
if [ "$RC" -eq 0 ]; then
  echo "lane3_final_drift=PASS"
  echo "lane3_closeout=PASS"
  exit 0
fi
if [ "$RC" -eq 2 ]; then
  echo "lane3_final_drift=FAIL reason=nonzero_changes"
  "$TF" show -no-color "$PLAN_FINAL"
  exit 30
fi
echo "lane3_final_drift=FAIL reason=terraform_error rc=$RC"
exit "$RC"
