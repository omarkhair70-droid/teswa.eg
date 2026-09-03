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
