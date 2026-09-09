# Teswa Lane 2 -> Lane 4 Compatibility Handoff

Date: 2026-09-04

Source lane: `refactor/backend-boundary-20260903`
Target consumer lane: `migration/supabase-to-oci-20260903`

## Purpose

Lane 2 is now complete and green at feature level. The migration lane must use the final Teswa-owned contracts as the semantic authority for rehearsal/parity validation rather than relying on the older intermediate Lane 2 status captured in Lane 4 docs.

Published Lane 4 docs currently describe Lane 2 as partially progressed. That statement is stale relative to the completed Lane 2 state.

## Final Lane 2 state

- feature-level direct `@/lib/supabase/client` imports: 0
- Backend Boundary Guard: PASS
- TypeScript: PASS
- Supabase remains the active production provider
- provider-specific code is isolated under `lib/backend/adapters/supabase/**` plus the provider shell
- no OCI cutover was performed by Lane 2

Canonical Lane 2 handoff:

`docs/TESWA_BACKEND_BOUNDARY_FINAL_HANDOFF_2026-09-03.md`

## Semantic authority for Lane 4

Lane 4 should verify that an OCI rehearsal target can preserve the behavior required by the following Teswa-owned runtime surfaces:

- Auth
- Account lifecycle
- Profile / social graph
- Marketplace / listings / item discovery
- Offers
- Deals
- Media
- Messaging realtime
- Direct messaging transport
- Contextual / story-reply messaging transport
- Notifications
- Stories
- Discovery / City Pulse
- Dolab
- Analytics
- Policy acceptance
- Reviews
- Moderation / reports / admin

The migration must not require screens/features to regain awareness of Supabase tables, RPCs, buckets, Realtime channels, PostgREST types, or Edge Function invocation syntax.

## Required rehearsal invariants

### Identity / auth

- preserve existing application user UUIDs exactly
- preserve ownership/participant relationships keyed by those UUIDs
- do not silently generate replacement user identifiers
- preserve session-visible identity semantics expected by the Auth contract

### Profile / social

- profile read/update semantics remain equivalent
- username and profile ownership rules remain equivalent
- follow/unfollow state and follower/following lists remain equivalent
- block state must preserve both directions and interaction blocking semantics
- trust metrics and badge results must remain semantically equivalent

### Marketplace / listings

- listing status/lifecycle semantics remain equivalent
- archive/reactivate/delete outcome conditions must remain equivalent
- editable listing ownership checks remain equivalent
- item image ordering/primary metadata remains equivalent
- likes and counts remain equivalent
- item video metadata and discovery presence remain equivalent
- My Listings aggregation and open-offer counts remain equivalent

### Offers / deals

- offer/deal lifecycle outcome codes used by Teswa contracts must remain equivalent
- participant authorization must remain equivalent
- deal completion/review eligibility semantics must remain equivalent
- unread/read state must remain equivalent

### Messaging / realtime

- direct, contextual, and deal messages preserve ordering and timestamps
- read markers/unread counts preserve behavior
- direct reactions, typing, delete semantics, reply metadata, and attachments remain compatible
- contextual story-reply threads preserve participant/context linkage
- realtime replacement must preserve event ordering/reconnect behavior expected by the runtime contract

### Media / object storage

- preserve all nine logical media purposes
- OCI physical target may remain the single private `teswa-media` bucket with prefix isolation
- preserve object ownership and object-key identity needed by product metadata
- signed/public URL behavior must be provided through the Media contract; do not weaken the physical bucket ACL to imitate Supabase public buckets
- storage rehearsal requires exact byte/hash parity before target acceptance

### Stories / discovery

- story ownership and expiration semantics remain equivalent
- likes/views/viewer lists remain equivalent
- active-story ordering/grouping remains equivalent
- City Pulse / mixed discovery must preserve the query-visible product behavior, even if implementation changes

### Notifications

- notification records, preferences, timezone, device registration, and unread semantics remain equivalent
- do not copy Supabase `pg_net`/Edge Function transport as a permanent OCI design merely for parity
- business behavior is the invariant; provider transport may be rebuilt behind workers/events

### Dolab

- preserve Dolab item/media/note records and relationships
- preserve local-first fallback expectations
- publish-source and media-link semantics must remain compatible

### Policy acceptance

- preserve policy key + version acceptance history
- unique/idempotent acceptance behavior must remain equivalent

### Reviews / moderation

- completed-deal review eligibility and duplicate prevention remain equivalent
- report target/participant/self-report validation remains equivalent
- moderation queue state/actions remain equivalent
- admin authorization behavior remains equivalent

### Analytics

- migration does not need to preserve Supabase-specific transport
- runtime must retain privacy-filtered metadata semantics and event acceptance behavior

### Account deletion

- current production behavior invokes the Supabase `delete-account` function through the Account lifecycle adapter
- OCI cutover requires an equivalent Teswa-owned account deletion orchestration before provider authority switches
- do not remove the Supabase deletion path before the replacement is verified

## Database migration guidance

Lane 4 may use provider-specific SQL/table/RPC knowledge inside migration tooling. That is allowed.

What must not happen is leaking those provider details back into product feature code.

The database rehearsal should distinguish:

1. **data/schema invariants that must move**
2. **business semantics that must be preserved**
3. **Supabase transport/runtime internals that should be replaced rather than copied literally**

Examples of the third category include Supabase-specific HTTP/Edge Function fanout, `pg_net`, Vault coupling, or provider-specific realtime transport machinery.

## Required Lane 4 evidence before integration

Lane 4 should produce evidence for:

- PostgreSQL 17 target preflight
- empty target before initial load
- schema/object manifest parity appropriate to the portable target
- row-count/data parity
- FK/orphan validation
- UUID continuity
- Storage object + SHA-256 parity
- semantic checks mapped to the Teswa contract surfaces above
- rollback rehearsal
- explicit rehearsal readiness verdict

Supabase remains authoritative until all required evidence is green and an explicit cutover decision is made.

## Integration handoff trigger

Lane 2 does not need further feature refactoring while Lane 4 performs the rehearsal.

The next Backend/Integration action is triggered when Lane 4 has pushed either:

- a PostgreSQL rehearsal load/parity result, or
- new OCI-side runtime/provider implementation work that must satisfy the Teswa contracts.

At that point, review the Lane 4 diff against this document and the final Lane 2 handoff before wiring OCI adapters or changing runtime provider authority.
