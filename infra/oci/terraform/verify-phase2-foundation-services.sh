#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
MEDIA="$("$TF" output -raw media_bucket_name)"
BACKUPS="$("$TF" output -raw backups_bucket_name)"
VAULT="$("$TF" output -raw teswa_vault_id)"
TOPIC="$("$TF" output -raw ops_notification_topic_id)"
NAMESPACE="$(oci os ns get --query data --raw-output)"

echo "TESWA OCI PHASE 2 VERIFY"

bucket_check() {
  local name="$1"
  local expect_versioning="$2"
  local raw

  raw="$(oci os bucket get     --bucket-name "$name"     --namespace-name "$NAMESPACE"     --output json)"

  printf '%s' "$raw" | python3 -c '
import json,sys
name, expected_compartment, expected_versioning = sys.argv[1:]
p=json.load(sys.stdin).get("data",{})
actual_name=p.get("name")
public=p.get("public-access-type")
compartment=p.get("compartment-id")
versioning=p.get("versioning")
ok=(actual_name==name and public=="NoPublicAccess" and compartment==expected_compartment)
if expected_versioning=="Enabled":
    ok=ok and versioning=="Enabled"
print("bucket=%s private=%s versioning=%s compartment_match=%s" % (
    name,
    str(public=="NoPublicAccess").lower(),
    versioning,
    str(compartment==expected_compartment).lower(),
))
if not ok:
    raise SystemExit(2)
' "$name" "$COMPARTMENT" "$expect_versioning"
}

bucket_check "$MEDIA" "any"
bucket_check "$BACKUPS" "Enabled"

VAULT_JSON="$(oci kms management vault get --vault-id "$VAULT" --output json)"
printf '%s' "$VAULT_JSON" | python3 -c '
import json,sys
expected_compartment=sys.argv[1]
p=json.load(sys.stdin).get("data",{})
state=p.get("lifecycle-state")
vtype=p.get("vault-type")
compartment=p.get("compartment-id")
print("vault_name=%s vault_type=%s state=%s compartment_match=%s" % (
    p.get("display-name"),
    vtype,
    state,
    str(compartment==expected_compartment).lower(),
))
if vtype!="DEFAULT" or compartment!=expected_compartment or state not in ("ACTIVE","CREATING"):
    raise SystemExit(3)
' "$COMPARTMENT"

TOPIC_JSON="$(oci ons topic get --topic-id "$TOPIC" --output json)"
printf '%s' "$TOPIC_JSON" | python3 -c '
import json,sys
expected_compartment=sys.argv[1]
p=json.load(sys.stdin).get("data",{})
state=p.get("lifecycle-state")
compartment=p.get("compartment-id")
print("topic_name=%s state=%s compartment_match=%s" % (
    p.get("name"),
    state,
    str(compartment==expected_compartment).lower(),
))
if p.get("name")!="teswa-ops" or compartment!=expected_compartment or state not in ("ACTIVE","CREATING"):
    raise SystemExit(4)
' "$COMPARTMENT"

echo
echo "Terraform drift check:"
set +e
"$TF" plan   -detailed-exitcode   -no-color   -var='enable_object_storage=true'   -var='enable_vault=true'   -var='enable_notifications=true'   >/tmp/teswa-phase2-postapply-plan.txt
PLAN_RC=$?
set -e

case "$PLAN_RC" in
  0)
    echo "terraform_drift=none"
    ;;
  2)
    echo "terraform_drift=changes_detected"
    tail -n 100 /tmp/teswa-phase2-postapply-plan.txt
    exit 5
    ;;
  *)
    echo "terraform_plan=error"
    tail -n 100 /tmp/teswa-phase2-postapply-plan.txt
    exit "$PLAN_RC"
    ;;
esac

echo
echo "Phase 2 verification is green."
echo "No OCIDs are intentionally printed."
