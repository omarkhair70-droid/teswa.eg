# Teswa Supabase -> OCI Migration Audit

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`  
Starting SHA: `14e7198ec42f33bf0fca781c0c5c0502c628b786`

## Scope and safety

This is Lane 4 from `TESWA_COMPANY_CLOSURE_PARALLEL_PLAN_2026-09-03.md`.

The audit was performed against the repository and the live Supabase production project using read-only metadata/catalog queries only. No DDL, DML, schema reset, storage deletion, auth mutation, Edge Function deployment, migration application, or destructive production action was performed.

Source Supabase remains production authority until the migration gates, Lane 2 backend boundaries, Lane 3 OCI platform, shadow verification, and an explicit cutover decision are complete.

## Executive result

The migration is feasible, but it is **not** a PostgreSQL dump-and-switch operation.

Teswa currently depends on Supabase-specific behavior in four important layers:

1. authorization: RLS and RPC functions depend heavily on `auth.uid()`;
2. identity: application rows are tied to Supabase Auth UUIDs and a new-user trigger creates profile state;
3. storage: nine buckets have public/private and path-based authorization semantics;
4. runtime services: Realtime publications, Edge Functions, pg_cron/pg_net/Vault, and notification fanout participate in product behavior.

The safest path is therefore:

`Supabase authority -> OCI shadow -> parity verification -> controlled final delta/freeze -> OCI authority`

not dual-authoritative writes from day one.

## Source-of-truth findings

### Migration history

Live production currently contains **78 applied migrations**.

The repository also contains **78 migration SQL files**. Live production confirms the newest migration is applied:

`20260820164619_direct_request_send_semantics`

The checked-in `supabase/PRODUCTION_MIGRATION_HISTORY.txt` was one migration behind at the start of this audit. This branch reconciles the snapshot with the live read-only migration list.

### Bootstrap gap

The tracked migration chain starts at:

`20260515093000_create_marketplace_items_view.sql`

That migration assumes foundational objects already exist, including `public.items`, `public.profiles`, `public.categories`, and `public.item_images`.

Therefore the current historical migrations are **not sufficient to bootstrap an empty OCI database**.

For OCI, do not invent missing pre-May migrations and do not replay a knowingly incomplete chain as the initial target bootstrap. Capture an authoritative current-state schema baseline from live production, verify it against catalogs, then treat the 78 migrations as historical lineage and start target evolution from the verified baseline.

## Live production inventory

Snapshot captured read-only on 2026-09-03.

| Surface | Live inventory |
| --- | ---: |
| Public tables | 46 |
| Public views | 1 |
| Public tables with RLS disabled | 0 |
| Public indexes | 188 |
| Public constraints | 249 |
| Public functions | 80 |
| SECURITY DEFINER public functions | 72 |
| Public functions using `auth.uid()` | 58 |
| Public RLS policies | 99 |
| Storage RLS policies | 29 |
| Public user triggers | 23 |
| Public enum types | 12 |
| Direct public FKs to `auth.users` | 21 |
| Supabase Realtime published tables | 6 |
| Storage buckets | 9 |
| Storage objects | 154 |
| Auth users | 32 |
| Auth identities | 32 |
| Profiles | 32 |
| Active Edge Functions | 5 |
| Active cron jobs | 1 |

### Public tables

`profiles`, `categories`, `items`, `item_images`, `item_wanted_tags`, `offers`, `offer_events`, `swap_deals`, `deal_messages`, `deal_confirmations`, `reviews`, `reports`, `notifications`, `discovery_examples`, `admin_users`, `feedback`, `featured_story_items`, `creator_drops`, `creator_drop_items`, `deal_message_reads`, `account_deletion_requests`, `push_devices`, `stories`, `story_views`, `story_likes`, `contextual_conversations`, `contextual_messages`, `contextual_message_reads`, `item_videos`, `user_blocks`, `user_policy_acceptances`, `notification_preferences`, `smart_notification_dispatches`, `user_follows`, `analytics_events`, `badge_definitions`, `user_badges`, `direct_conversations`, `direct_messages`, `item_likes`, `dolab_items`, `dolab_media`, `dolab_notes`, `direct_message_attachments`, `direct_message_reactions`, `direct_typing_state`.

### Public view

`marketplace_items` is a filtered marketplace projection over items/categories/profiles plus the primary item image. It excludes non-active items and banned profiles. Preserve the view contract or reproduce it behind the Teswa-owned marketplace boundary.

### Enum types

The live schema contains domain enums for deal status, discovery example type, item condition, item desire mode, item source, item status, notification type, offer event type, offer redirect type, offer status, report reason, and report status.

These values are domain contracts and should be preserved exactly during baseline creation.

## Authorization / RLS

All 46 public tables have RLS enabled.

Two RLS-enabled tables intentionally have zero table policies:

- `analytics_events`
- `user_badges`

Current repository history shows these are restricted through RPC-oriented access rather than direct table access. Do not "fix" them during migration merely because a linter reports RLS-without-policy.

There are 80 public functions, 72 of which are SECURITY DEFINER. Fifty-eight functions directly reference `auth.uid()`. This is a critical compatibility boundary.

### OCI requirement

Before OCI can become authority, one of these models must be deliberately selected by Lane 2:

- preserve a PostgreSQL-compatible request identity context that reproduces current RLS/RPC semantics; or
- move authorization into Teswa-owned API/service boundaries and invoke DB operations using server-side identity-aware contracts.

Do not remove RLS authorization semantics merely because the target is no longer Supabase.

## Auth

Live identity snapshot:

- 32 `auth.users`
- 32 identities
- 31 Google identities
- 1 email identity
- 32 profiles

There are 21 direct public foreign-key references to `auth.users`.

The live database also has:

`auth.users -> on_auth_user_created -> public.handle_new_user`

The user UUID is therefore a cross-system identity key, not an implementation detail.

### Auth migration rule

Preserve existing user UUIDs exactly.

Do not treat a raw copy of the Supabase/GoTrue internal `auth` schema as the long-term Teswa auth architecture. A safer staged route is:

1. keep Supabase Auth authoritative while OCI runs in shadow;
2. let the Teswa backend validate the existing authenticated identity and carry the same UUID into OCI;
3. reproduce profile bootstrap/account-deletion behavior behind Teswa-owned auth contracts;
4. migrate provider ownership only after Google/email sign-in, token/session handling, account deletion, and UUID continuity are verified.

## RPC / function surface

Current application code calls many database RPCs directly. Critical families include:

- offers/deals state transitions;
- listing lifecycle;
- reports/moderation;
- follows/blocks;
- badges/trust;
- notification preferences and push registration;
- analytics;
- contextual messaging;
- native direct chat;
- public marketplace/city pulse queries.

The migration must preserve behavior, authorization, return shape, error semantics, and side effects—not only function names.

The repository search also confirms broad direct Supabase coupling in application modules: direct table access, RPC calls, Storage calls, Auth calls, and Realtime channels. Lane 4 must not broadly rewrite these callers; Lane 2 owns the provider-independent service boundary.

## Triggers

There are 23 non-internal triggers on public tables. Important behavioral triggers include:

- item owner-update guard;
- profile self-update guard;
- offer insert/lifecycle guards;
- offer event logging;
- swap-deal lifecycle guard;
- direct-message attachment object guard;
- direct-message notification fanout;
- user-block follow cleanup;
- updated-at triggers.

The notification table also has:

`notifications_push_fanout -> http_request`

This is Supabase/runtime-specific transport and should be rebuilt behind an OCI worker/event mechanism, not copied blindly.

## Realtime

The live `supabase_realtime` publication contains six Teswa tables:

- `deal_message_reads`
- `deal_messages`
- `direct_message_attachments`
- `direct_message_reactions`
- `direct_messages`
- `direct_typing_state`

OCI must reproduce product-level realtime behavior for these surfaces before the app can stop using the Supabase Realtime provider.

Shadow verification should compare event identity/order/payload and final database state rather than assume wire-protocol equivalence is required.

## Storage

Nine live buckets contain 154 objects totaling approximately 120.7 MiB at audit time.

| Bucket | Access | Objects | Approx bytes | Important contract |
| --- | --- | ---: | ---: | --- |
| `contextual-voice-messages` | private | 6 | 478,375 | participant/sender path auth |
| `deal-voice-messages` | private | 11 | 565,788 | participant/sender path auth |
| `direct-chat-media` | private | 11 | 4,575,396 | conversation participant + sender path |
| `direct-voice-messages` | private | 1 | 29,850 | participant/sender path auth |
| `dolab-media` | private | 1 | 599,569 | owner prefix |
| `item-images` | public | 56 | 26,864,064 | owner write path |
| `item-videos` | private | 5 | 13,403,518 | public-active read semantics + owner write |
| `profile-images` | public | 40 | 19,771,910 | avatar/cover owner paths |
| `story-media` | private | 23 | 60,230,849 | active-story read + owner prefix |

Database references include storage keys and some full public URLs. `delete-account` also understands Supabase public URL markers for item/profile media.

### Storage migration rule

Copy objects while preserving object keys and metadata. Verify object count, byte size, and content hash. For rows containing full Supabase public URLs, either rewrite those values **on the OCI target only** after object parity or provide a compatibility URL layer. Never mutate source URLs during the audit/shadow phase.

## Edge Functions / scheduled work

Live Edge Functions:

- `send-notification-push` — active, JWT verification disabled; protected by Teswa webhook secret semantics;
- `delete-account` — active, JWT verification enabled;
- `run-smart-reengagement-notifications` — active, JWT verification disabled; protected by job-secret semantics;
- `stream-chat-token` — active legacy compatibility stub;
- `stream-direct-message-webhook` — active legacy compatibility stub.

One active hourly cron job drives smart re-engagement. The current implementation depends on `pg_cron`, `pg_net`, and Supabase Vault.

Installed production extensions are:

- `pg_cron`
- `pg_net`
- `pg_stat_statements`
- `pgcrypto`
- `plpgsql`
- `supabase_vault`
- `uuid-ossp`

For OCI, preserve business behavior but rebuild Supabase-specific scheduling/HTTP/secret transport using the Lane 3 runtime and secrets design.

## KEEP / FIX / REBUILD / DELETE

### KEEP

- UUID identity values and all FK relationships.
- Current domain tables, enums, constraints, indexes, and view semantics.
- RLS/RPC authorization behavior.
- Business state machines and trigger side effects.
- Storage object keys and access semantics.
- Migration lineage and immutable historical SQL.
- Current Supabase source as rollback authority through the approved rollback window.

### FIX

- Reconcile the stale checked-in production migration snapshot.
- Capture a reproducible live current-state schema baseline for OCI bootstrap.
- Create deterministic schema/data/storage fingerprints.
- Normalize target-only public media URLs or introduce a compatibility URL layer.
- Make source/target verification executable and repeatable.

### REBUILD

- Auth request identity context / Teswa auth boundary.
- Supabase Storage API semantics on OCI Object Storage.
- Realtime gateway/subscriptions.
- Edge Function workloads.
- notification push fanout transport.
- hourly smart-reengagement scheduler/worker.
- account-deletion orchestration.
- secret transport currently using Supabase Vault.
- any provider-specific client dependency behind Lane 2 interfaces.

### DELETE

Only after replacement parity is proven, and only from the target/runtime path:

- legacy Stream chat compatibility stubs;
- Supabase-specific `pg_net`/Vault/cron transport where OCI services replace it.

Do **not** delete source Supabase objects, policies, migrations, data, buckets, or users during this lane.

Do **not** remove "unused" or duplicate indexes as migration cleanup. Parity comes before optimization.

## Migration plan

### Phase 0 — Freeze migration invariants

- Supabase stays authoritative.
- Continue normal reviewed production changes only through migration files.
- Regenerate source inventory after any production schema change.
- Do not edit historical applied migration intent.

### Phase 1 — Build authoritative OCI baseline

- capture current live schema definitions;
- include public schema, enum types, view, constraints, indexes, triggers, function definitions/grants, policies, and required generic extensions;
- separate Supabase-owned auth/storage internals from Teswa-owned domain baseline;
- create a schema fingerprint;
- bootstrap an empty isolated PostgreSQL 17 target;
- run contract tests and catalog diff.

This baseline solves the known pre-May bootstrap gap without inventing history.

### Phase 2 — Bring up OCI non-production platform

Owned by Lane 3:

- PostgreSQL 17;
- API runtime;
- Object Storage;
- realtime gateway;
- background workers/scheduler;
- TLS/network;
- secrets;
- backup/restore;
- metrics/logging/health.

No production routing change.

### Phase 3 — Initial data copy

- snapshot/copy public application data read-only from source;
- preserve UUIDs and timestamps;
- load in dependency-safe order;
- verify counts, FK integrity, nullability, enum values, and deterministic checksums;
- keep Supabase writes authoritative.

### Phase 4 — Auth bridge

- preserve the 32 current user UUIDs;
- keep source auth authoritative initially;
- verify Google and email sign-in identity continuity;
- reproduce profile bootstrap and account-deletion contracts;
- prove auth context can enforce OCI authorization semantics.

### Phase 5 — Storage copy

- enumerate all 154 source objects;
- copy with unchanged object keys;
- verify per-object hash/size and bucket totals;
- reproduce public/private access and signed/private reads;
- validate URL mapping on the target.

### Phase 6 — Realtime + worker shadow

- stream/observe the six current realtime tables into the OCI runtime;
- shadow notification/direct-chat/deal-message behavior;
- run scheduler and push workflows in non-delivery/dry-run mode where appropriate;
- compare expected side effects without producing duplicate user notifications.

### Phase 7 — Shadow reads

Through Lane 2 interfaces:

- execute representative reads against Supabase and OCI;
- return Supabase results to users;
- discard OCI responses after comparison;
- compare result shape, ordering, authorization outcome, and entity IDs;
- record mismatches by contract.

Avoid broad dual writes during this phase.

### Phase 8 — Cutover rehearsal

On an isolated/rehearsal environment:

- initial snapshot;
- delta procedure;
- auth/storage/realtime checks;
- smoke critical user journeys;
- run rollback drill;
- measure expected freeze/final-delta process.

### Phase 9 — Production cutover

Only after all gates pass:

1. announce/enter controlled write freeze or maintenance boundary;
2. take final source watermark/snapshot;
3. copy final delta;
4. verify counts/checksums/storage/auth/RPC contracts;
5. switch Teswa backend/provider routing to OCI;
6. run critical live smoke;
7. end freeze only when OCI is confirmed authoritative.

### Phase 10 — Rollback posture

During the approved rollback window:

- keep Supabase intact and recoverable;
- keep the final source watermark/snapshot;
- retain routing ability back to Supabase;
- if cutover smoke fails, stop OCI-authoritative writes and route back;
- reconcile any OCI-only accepted writes before declaring rollback complete.

Do not destroy or mutate Supabase merely because initial OCI smoke is green.

## Verification gates

### Schema

- 46 public tables;
- 1 marketplace view;
- 12 enum types with exact values/order;
- constraints/indexes match intended baseline;
- trigger inventory and function signatures match;
- no accidental loss of RLS-protected surfaces.

### Data

For every application table:

- source/target row counts at the same watermark;
- primary-key set comparison;
- deterministic row checksum by stable column ordering;
- FK orphan scan;
- status/enum distribution comparison for state-machine tables.

### Auth

- 32 user UUIDs preserved at audit baseline;
- profile ID parity;
- Google/email identity continuity;
- current-user context maps to the same UUID;
- auth-sensitive RPC/RLS scenario matrix passes.

### Storage

- 9 bucket contracts mapped;
- 154 objects at audit baseline;
- object key, byte length, and hash parity;
- public/private access behavior parity;
- signed/private URL behavior parity;
- account deletion removes the expected target objects.

### RPC / authorization

For every app-used RPC:

- same input contract;
- same success result shape;
- same unauthorized/invalid-state outcome;
- same state transition;
- same notification/audit side effects.

### Realtime

For all six published tables:

- insert/update/delete events needed by the product arrive;
- ordering/duplication behavior is acceptable;
- reconnect/catch-up does not lose final state;
- typing/read/message flows pass end-to-end.

### Background/Edge workloads

- push notification fanout parity;
- smart re-engagement reserve/dedupe/quiet-hour behavior;
- account deletion parity;
- legacy Stream stubs are not on any required production path before removal.

## Shadow rules

1. Supabase is the only source of production truth until explicit cutover.
2. Shadow reads may hit OCI, but user responses continue from the source.
3. Shadow jobs must not double-send push notifications or mutate user-visible state.
4. Every comparison is tied to a source watermark.
5. Any drift blocks cutover; it is not waived by manually editing the source.
6. A final controlled delta is safer than an unproven permanent dual-write system.

## Existing non-migration debt observed

Supabase advisors currently report, among other items:

- mutable `search_path` warnings on several functions;
- RLS-without-policy informational notices for the intentionally RPC-restricted tables above;
- multiple permissive-policy performance warnings;
- duplicate indexes on `notifications` and `reports`;
- unused-index informational findings.

These are not reasons to mutate production during the migration audit. Preserve parity first, then handle hardening/optimization in an explicitly owned lane.

## Lane dependencies

### Lane 2 — Backend Decoupling

Required before production cutover:

- auth contract;
- profile/user contract;
- marketplace contract;
- offers/deals contract;
- messaging/realtime contract;
- media/storage contract;
- notifications contract;
- provider adapters.

### Lane 3 — Oracle Cloud Platform

Required before shadow:

- target PostgreSQL;
- object storage;
- API runtime;
- realtime runtime;
- scheduler/workers;
- secrets;
- backups;
- observability;
- deployment topology.

## Handoff

### Base SHA

`14e7198ec42f33bf0fca781c0c5c0502c628b786`

### Files owned/touched by Lane 4

- `docs/SUPABASE_TO_OCI_MIGRATION_AUDIT_2026-09-03.md`
- `scripts/supabase-to-oci-readonly-inventory.sql`
- `supabase/PRODUCTION_MIGRATION_HISTORY.txt` — snapshot reconciliation only

### Validation performed

- live project identity verified from Teswa schema/migration chain;
- live migration list compared with Git;
- live catalog queried read-only for schema/RLS/functions/triggers/storage/auth/realtime/cron/extensions;
- application direct-Supabase dependency inventory sampled from repository;
- no destructive production mutation performed.

### Remaining blockers before implementation/cutover

- OCI platform is not yet the verified non-production target for this lane;
- provider-independent backend seams are not yet the integration authority;
- current-state OCI bootstrap baseline still needs to be generated/tested against an empty target;
- shadow data/storage/auth/realtime verification has not yet been executed;
- production cutover remains explicitly blocked.
