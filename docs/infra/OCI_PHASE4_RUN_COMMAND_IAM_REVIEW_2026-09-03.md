# Teswa Phase 4 Run Command IAM Plan Review — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Saved plan:** `teswa-phase4-run-command-iam.plan`  
**Status:** APPROVED FOR APPLY

## Diagnosis

The first read-only OS inventory command remained `ACCEPTED` and never entered `IN_PROGRESS`.

The control-plane preflight found:

- `matching_dynamic_groups=0`
- `matching_root_policies=0`
- one accepted command on `teswa-core-01`

## Reviewed plan

Terraform returned:

- 2 adds
- 0 changes
- 0 destroys
- `phase4_iam_plan_guard=PASS`

Creates only:

- `oci_identity_dynamic_group.teswa_run_command[0]`
- `oci_identity_policy.teswa_run_command[0]`

## Authorization scope

The dynamic group matches instances in the dedicated Teswa platform compartment.

The policy grants only:

`use instance-agent-command-execution-family`

inside `teswa-platform`, with the same-instance condition:

`request.instance.id=target.instance.id`

This is the documented OCI Run Command instance-principal pattern.

## Boundary

No compute, reboot, networking, storage, Vault, Object Storage, database, DNS, Nova, or Supabase change is present.

After apply, control-plane IAM must be verified first. Then the read-only OS inventory can be retried while allowing for dynamic-group propagation.
