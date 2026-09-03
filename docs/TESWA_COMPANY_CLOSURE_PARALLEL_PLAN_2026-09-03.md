# Teswa 2026 Company Product Closure — Parallel Work Plan

Date: 2026-09-03

## Purpose

Teswa is treated as an active company product with production users. Parallel work must increase product and infrastructure quality without destabilizing the current production lane.

The current Android modernization branch remains the release-engineering authority until the SDK 57 R8 proof, APK runtime smoke, and Play-signed Internal smoke are complete.

## Shared rules

1. Production v24 remains frozen until a newer candidate passes the full release gates.
2. No lane may merge directly to `main`.
3. No lane may change another lane's owned files without recording the dependency first.
4. Audit before rewrite. Use `KEEP / FIX / REBUILD / DELETE`.
5. Backend migration is staged; no destructive Supabase cutover while it is still production authority.
6. New product/backend code should depend on Teswa-owned domain interfaces rather than importing Supabase directly.
7. Every implementation lane must end in validation and a handoff before integration.

## Lane 0 — Android / Release Engineering

Branch:
`modernize/expo57-platform-20260903`

Owner:
Current release chat.

Scope:
- Expo 57 / RN 0.86 platform baseline
- native dependency alignment
- R8 / minify / resource shrinking
- API 36
- 16 KB alignment
- APK runtime smoke
- Play Internal Play-signed smoke

Do not mix broad product/backend rewrites into this branch.

## Lane 1 — Product Reality Audit

Branch:
`audit/product-reality-20260903`

Initial mode:
Read-only audit and documentation until Lane 0 establishes the release candidate base.

Scope:
- first launch
- auth / onboarding
- Home
- Discover
- item detail
- Add / media
- offers / swap lifecycle
- deals
- Messages outer inbox and chat entry
- stories
- profile / trust
- notifications
- settings / privacy
- Dolab
- error/loading/empty/permission/network states

Output:
A prioritized `KEEP / FIX / REBUILD / DELETE` product map, severity-ranked bug list, and lane briefs.

## Lane 2 — Backend Decoupling Architecture

Branch:
`refactor/backend-boundary-20260903`

Initial mode:
Architecture + dependency inventory first. No broad runtime cutover yet.

Scope:
- inventory direct Supabase imports
- define Teswa-owned domain boundaries
- auth contract
- user/profile contract
- marketplace contract
- offers/deals contract
- messaging/realtime contract
- media/storage contract
- notifications contract
- analytics/telemetry contract
- introduce adapters progressively so UI/features do not know the backend provider

Goal:
Move from `Screen -> Supabase` to `Screen -> Teswa domain/service -> provider adapter/API`.

## Lane 3 — Oracle Cloud Platform

Branch:
`infra/oracle-platform-20260903`

Initial mode:
Infrastructure design and non-production bootstrap.

Scope:
- OCI compute topology based on actual tenancy quota
- PostgreSQL hosting plan
- API runtime
- realtime gateway
- background workers
- OCI Object Storage
- TLS / reverse proxy
- network/firewall rules
- secrets
- backups/restore
- logging/metrics/health checks
- deployment strategy

No production DNS/data cutover until migration gates pass.

## Lane 4 — Supabase -> OCI Data Migration

Branch:
`migration/supabase-to-oci-20260903`

Initial mode:
Read-only source-of-truth reconstruction and migration design.

Scope:
- authoritative schema inventory
- migrations and bootstrap gap
- tables/types/indexes/constraints/triggers
- RLS and authorization semantics
- RPC/function inventory
- data copy strategy
- storage object inventory
- validation/checksum/count comparisons
- shadow verification
- rollback strategy

No destructive Supabase mutations during audit.

## Lane 5 — Teswa Product / Design System

Branch:
`audit/product-system-20260903`

Initial mode:
Audit and system definition before broad visual implementation.

Scope:
- product identity and interaction thesis
- typography hierarchy
- spacing/radii/surfaces
- color semantics
- navigation language
- Arabic/RTL authorship
- motion and feedback
- loading/empty/error states
- component ownership
- accessibility
- cross-screen consistency

The goal is a reusable Teswa product system, not independent screen decoration.

## Integration order

1. Lane 0 release proof and runtime safety.
2. Lane 1 Product Reality Audit produces priorities.
3. Lane 2 backend boundaries establish provider-independent seams.
4. Lane 3 OCI platform comes online in non-production.
5. Lane 4 migrates and verifies data/storage/auth/realtime contracts behind the seams.
6. Lane 5 defines and closes the product system; implementation is coordinated with Lane 1 priorities.
7. Focused feature lanes may then branch from the integration base: Home/Discovery, Marketplace, Add/Media, Offers/Deals, Messaging, Profile/Trust, Stories, Dolab, Notifications, Auth/Onboarding, Settings/Privacy, Performance.
8. Final cross-product synthesis and release candidate gates.

## Merge discipline

Parallel branches are not merged merely because their local checks are green. Each lane must provide:
- current base SHA
- files owned/touched
- implementation summary
- tests/validation
- remaining risks
- explicit integration dependencies

A dedicated integration branch should combine lanes only after those handoffs are reviewed.
