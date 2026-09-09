# Teswa Supabase -> OCI Data Copy Plan

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`

## Scope

This plan is derived from a fresh **read-only** catalog query against the current
Teswa Supabase production database.

No production rows, constraints, Auth records, Storage objects, migrations, or
runtime configuration were changed.

The executable planner lives at:

`scripts/oci-migration/plan-data-copy.py`

## Live dependency graph

Current production has:

- 46 public tables;
- 104 foreign keys originating from public tables;
- 83 public -> public foreign keys;
- 21 public -> `auth.users` foreign keys;
- 0 other external-schema foreign-key targets.

The 21 Auth edges are a real migration boundary. They are not ordinary load
ordering noise: OCI must have an explicit identity-anchor strategy before those
constraints can be enforced.

## Cycles found

The live graph contains two cyclic components.

### 1. `items <-> offers`

Cause:

- offers reference items;
- `items.created_from_offer_id` references offers;
- `offers.parent_offer_id` is also self-referential.

These foreign keys are **not deferrable** in current production.

Fresh read-only snapshot:

- items: 39 rows;
- offers: 19 rows;
- `items.created_from_offer_id IS NOT NULL`: 0 rows;
- `offers.parent_offer_id IS NOT NULL`: 0 rows.

Therefore the current initial snapshot is not blocked by active cyclic values:
items can be loaded before offers at this watermark.

Do not turn that current data fact into a permanent cutover assumption. A later
delta can contain non-null cyclic references.

### 2. `direct_messages.reply_to_message_id -> direct_messages.id`

This foreign key is also **not deferrable**.

Fresh read-only snapshot:

- direct messages: 36 rows;
- non-null reply references: 0 rows.

Again, the current initial snapshot has no active reply dependency, but the
cutover procedure must support future replies.

## Current dependency stages

The planner treats public parents as load prerequisites and groups strongly
connected components.

### Stage 1 — roots / external-Auth anchored surfaces

- `badge_definitions`
- `categories`
- `contextual_conversations`
- `creator_drops`
- `feedback`
- `notification_preferences`
- `profiles`
- `stories`
- `user_blocks`
- `user_follows`
- `user_policy_acceptances`

Important: several of these are only graph roots because their parent is
`auth.users`. They must not be loaded under enforced Auth FKs until the OCI
identity anchor is ready.

### Stage 2

- `account_deletion_requests`
- `admin_users`
- `analytics_events`
- `user_badges`
- `items + offers` — cyclic group
- `contextual_message_reads`
- `contextual_messages`
- `direct_conversations`
- `push_devices`
- `story_likes`
- `story_views`

### Stage 3

- `creator_drop_items`
- `dolab_items`
- `featured_story_items`
- `item_images`
- `item_likes`
- `item_videos`
- `item_wanted_tags`
- `offer_events`
- `swap_deals`
- `direct_messages` — self-reference group
- `direct_typing_state`

### Stage 4

- `discovery_examples`
- `dolab_media`
- `notifications`
- `deal_confirmations`
- `deal_message_reads`
- `deal_messages`
- `reviews`
- `direct_message_attachments`
- `direct_message_reactions`

### Stage 5

- `dolab_notes`
- `smart_notification_dispatches`
- `reports`

## Tables with direct Auth anchors

The current catalog has public -> `auth.users` FKs from these tables:

- `contextual_conversations`
- `contextual_message_reads`
- `contextual_messages`
- `dolab_items`
- `dolab_media`
- `dolab_notes`
- `feedback`
- `notification_preferences`
- `notifications`
- `profiles`
- `smart_notification_dispatches`
- `stories`
- `story_likes`
- `story_views`
- `user_blocks`
- `user_follows`
- `user_policy_acceptances`

There are 21 constraints across these 17 tables.

## Target bootstrap consequence

A safe portable OCI bootstrap should be staged rather than treated as one raw
Supabase schema restore.

### Layer A — data-bearing structure

Create the reviewed target equivalents for:

- required enum types;
- public tables/columns;
- primary keys;
- unique/check constraints needed for row validity;
- provider-neutral defaults only.

Do not activate provider-specific Auth/Storage/Realtime transport in this layer.

### Layer B — initial application data

Load the current read-only snapshot with UUIDs and timestamps preserved.

For the current watermark, the two cyclic optional references are all null, so
the initial load can use the dependency order above.

### Layer C — referential validation

After identity anchors and all referenced rows exist:

- create/validate public -> public FKs;
- create/validate the 21 Auth-equivalent identity FKs only against the reviewed
  OCI identity model;
- run FK orphan checks.

### Layer D — provider/runtime behavior

Only after Lane 2/Lane 3 contracts are available:

- authorization/RLS-equivalent behavior;
- RPC/function behavior;
- triggers with business side effects;
- Realtime;
- notification fanout;
- scheduled workers;
- Storage access semantics.

This prevents a data import from accidentally firing production-style push,
HTTP, cron, or other provider side effects.

## Delta / cutover rule for cyclic references

The initial snapshot currently has no active cyclic values, but the final delta
must not rely on that remaining true.

Before every rehearsal/final delta:

1. recapture the source manifest;
2. inspect non-null cyclic-reference counts;
3. if cyclic references exist, load through a reviewed target-only staging/two-pass
   procedure:
   - insert parent/entity rows first without activating the nullable cyclic link;
   - insert the referenced rows;
   - restore the exact cyclic FK values;
   - validate checksums and FK integrity;
4. never weaken or edit Supabase production constraints to make the copy easier.

## Verification after each load watermark

Required:

- source/target row counts;
- primary-key set hashes;
- deterministic row checksums;
- FK orphan scan;
- enum/status distributions;
- Auth UUID fingerprint continuity;
- Storage object parity separately.

The comparison tooling is under `scripts/oci-migration/`.

## Current blocker to execution

This plan is executable preparation only.

A real copy is still blocked until Lane 3 exposes an isolated Teswa PostgreSQL 17
target and Lane 2 supplies the relevant provider/auth boundaries.

Supabase production remains authoritative.
