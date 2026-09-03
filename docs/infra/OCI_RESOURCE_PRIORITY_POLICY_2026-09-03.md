# OCI Resource Priority Policy — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** ACTIVE; supersedes the earlier absolute Nova no-touch rule for future capacity decisions.

## Product priority

Teswa is the primary OCI product lane.

Current business priority:

1. Teswa — primary production/company product.
2. Nova — secondary product whose OCI allocation may be reduced or released if Teswa needs the capacity.
3. Balcona — out of scope for this repository/lane and remains untouched.

## What changed

Earlier OCI foundation work treated `nova-backend` as a hard no-touch boundary because the goal was to prove Teswa isolation without affecting an existing workload.

That served Phase 1 correctly.

For future capacity decisions, the rule is now:

> Teswa production capacity may take priority over Nova capacity after a read-only impact/utilization review.

This is not authorization for blind deletion or destructive changes.

## Required sequence before reallocation

1. Measure Nova's current shape, storage, and recent utilization.
2. Decide the minimum Nova capacity worth retaining, if any.
3. Check the exact Teswa compute requirement for PostgreSQL + API + Realtime + Workers.
4. Produce a Terraform/OCI change plan showing the before/after allocation and billing boundary.
5. Review downtime and rollback implications.
6. Only then resize/stop/reassign Nova resources.

## Current measured shared pool

- Nova currently owns the existing A1 `VM.Standard.A1.Flex`.
- Previous inventory measured it at 2 OCPU / 12 GB RAM with a 47 GB boot volume.
- The tenancy has two unused E2 Micro slots.
- 153 GB of the 200 GB Always Free Block Storage pool remains.
- Teswa has no compute/boot/block volume yet.

## Safety boundary

Until a reallocation plan is explicitly reviewed:

- no Nova stop
- no Nova resize
- no Nova boot-volume deletion
- no Nova network changes
- no Teswa production cutover
- no Supabase shutdown


## Nova utilization evidence

Seven-day read-only monitoring of `nova-backend` returned:

- shape: `VM.Standard.A1.Flex`
- current allocation: 2 OCPU / 12 GB RAM
- boot volume: 47 GB
- Compute Agent CPU: average 6.25%, maximum 38.70%
- Compute Agent memory: average 18.56%, maximum 23.92%

The agentless CPU stream produced a maximum above 100%, so it is not used as the sizing authority for this decision.

## Initial reallocation decision

Resize Nova to **1 OCPU / 6 GB RAM** and reserve the released **1 OCPU / 6 GB RAM** for Teswa.

Reasoning:

- peak observed memory on 12 GB was below 24%, so 6 GB leaves substantial headroom;
- peak Compute Agent CPU on 2 OCPU was below 39%; a rough linear projection to 1 OCPU remains below full saturation;
- this preserves Nova as a running secondary product while making half of the Always Free A1 pool available to Teswa.

OCI documents that changing a running flexible VM shape configuration reboots the instance. The resize is not executed until the dedicated preflight passes.
