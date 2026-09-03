# OCI Inventory

This directory contains read-only tooling for measuring the OCI tenancy before Teswa infrastructure is provisioned.

## Preferred execution: OCI Cloud Shell

Cloud Shell already has OCI CLI authentication for the signed-in tenancy.

```bash
git clone https://github.com/omarkhair70-droid/teswa.eg.git
cd teswa.eg
git checkout infra/oracle-platform-20260903
bash infra/oci/inventory/collect.sh
```

The script writes a timestamped folder under `infra/oci/inventory/out/`.

## Local execution

OCI CLI must already be authenticated. The script reads the tenancy OCID from the selected OCI config profile.

Optional:

```bash
OCI_CLI_PROFILE=DEFAULT bash infra/oci/inventory/collect.sh
```

You may also provide the tenancy explicitly:

```bash
TENANCY_OCID=ocid1.tenancy... bash infra/oci/inventory/collect.sh
```

## Safety

The collector only performs list/get operations.

It does **not**:

- create, update, move or delete resources;
- change quotas;
- change firewall rules;
- provision compute;
- touch Supabase;
- touch Nova or Balcona;
- switch production traffic.

Inventory output can contain OCIDs, IP addresses and resource names. Do not commit it.
