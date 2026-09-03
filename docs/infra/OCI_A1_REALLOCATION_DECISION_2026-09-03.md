# Teswa / Nova A1 Reallocation Decision — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** APPROVED TARGET; preflight required before execution.

## Evidence

Nova currently runs on `VM.Standard.A1.Flex` at 2 OCPU / 12 GB RAM.

Seven-day metrics:

- CPU average: 6.25%
- CPU maximum: 38.70%
- memory average: 18.56%
- memory maximum: 23.92%

Boot volume: 47 GB.

## Decision

Resize Nova to **1 OCPU / 6 GB RAM**.

Reserve the released **1 OCPU / 6 GB RAM** for Teswa.

This preserves Nova while giving Teswa a real Always Free A1 budget.

## Why this target

At the observed Nova peak:

- memory use is under 3 GB, so 6 GB leaves roughly 2x peak-memory headroom;
- Compute Agent CPU at 38.70% of a 2-OCPU allocation projects to roughly 77% of one OCPU if demand scales linearly.

The agentless CPU stream is not used for sizing because its maximum exceeded 100%.

## Operational impact

OCI documents that changing the shape configuration of a running flexible VM reboots the instance.

Changing shape does not rebuild the VM; volume and VNIC/IP attachments remain associated with the instance.

## Execution gate

1. Run `preflight-nova-resize.sh`.
2. Require `preflight=PASS`.
3. Resize Nova to 1 OCPU / 6 GB.
4. Wait for Nova to return RUNNING.
5. Re-run Nova utilization/resource audit.
6. Re-run A1 resource availability.
7. Only after the released capacity is confirmed, create Teswa compute.

No Teswa production cutover or Supabase shutdown is part of this reallocation.
