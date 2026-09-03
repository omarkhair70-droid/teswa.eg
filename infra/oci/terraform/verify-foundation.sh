#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform not found" >&2
  exit 1
fi

if ! command -v oci >/dev/null 2>&1; then
  echo "oci CLI not found" >&2
  exit 1
fi

COMPARTMENT="$(terraform output -raw teswa_compartment_id)"
VCN="$(terraform output -raw teswa_vcn_id)"
PUBLIC_SUBNET="$(terraform output -raw public_edge_subnet_id)"
APP_SUBNET="$(terraform output -raw private_app_subnet_id)"
DATA_SUBNET="$(terraform output -raw private_data_subnet_id)"

echo "TESWA OCI FOUNDATION VERIFY"

COMP_STATE="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."lifecycle-state"' --raw-output)"
COMP_NAME="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data.name' --raw-output)"
echo "compartment name=$COMP_NAME state=$COMP_STATE"

VCN_NAME="$(oci network vcn get --vcn-id "$VCN" --query 'data."display-name"' --raw-output)"
VCN_STATE="$(oci network vcn get --vcn-id "$VCN" --query 'data."lifecycle-state"' --raw-output)"
VCN_CIDRS="$(oci network vcn get --vcn-id "$VCN" --query 'data."cidr-blocks"' --raw-output)"
echo "vcn name=$VCN_NAME state=$VCN_STATE cidrs=$VCN_CIDRS"

for pair in \
  "public_edge:$PUBLIC_SUBNET" \
  "private_app:$APP_SUBNET" \
  "private_data:$DATA_SUBNET"
do
  label="${pair%%:*}"
  id="${pair#*:}"
  name="$(oci network subnet get --subnet-id "$id" --query 'data."display-name"' --raw-output)"
  state="$(oci network subnet get --subnet-id "$id" --query 'data."lifecycle-state"' --raw-output)"
  cidr="$(oci network subnet get --subnet-id "$id" --query 'data."cidr-block"' --raw-output)"
  no_public="$(oci network subnet get --subnet-id "$id" --query 'data."prohibit-public-ip-on-vnic"' --raw-output)"
  echo "subnet role=$label name=$name state=$state cidr=$cidr prohibit_public_ip=$no_public"
done

NSG_COUNT="$(oci network nsg list --compartment-id "$COMPARTMENT" --all --query 'length(data)' --raw-output)"
INSTANCE_COUNT="$(oci compute instance list --compartment-id "$COMPARTMENT" --all --query 'length(data[?\`lifecycle-state\` != \`TERMINATED\`])' --raw-output)"
echo "nsg_count=$NSG_COUNT"
echo "compute_instances=$INSTANCE_COUNT"

echo
echo "Terraform drift check:"
set +e
terraform plan -detailed-exitcode -no-color >/tmp/teswa-foundation-postapply-plan.txt
PLAN_RC=$?
set -e

case "$PLAN_RC" in
  0)
    echo "terraform_drift=none"
    ;;
  2)
    echo "terraform_drift=changes_detected"
    echo "Review /tmp/teswa-foundation-postapply-plan.txt before any further apply."
    exit 2
    ;;
  *)
    echo "terraform_drift=plan_error"
    tail -n 80 /tmp/teswa-foundation-postapply-plan.txt
    exit "$PLAN_RC"
    ;;
esac

echo
echo "Expected green result:"
echo "- compartment teswa-platform AVAILABLE"
echo "- VCN teswa-vcn AVAILABLE at 10.20.0.0/16"
echo "- 3 subnets AVAILABLE"
echo "- private app/data prohibit_public_ip=true"
echo "- nsg_count=3"
echo "- compute_instances=0"
echo "- terraform_drift=none"
echo
echo "No OCIDs or IP addresses are intentionally printed."
