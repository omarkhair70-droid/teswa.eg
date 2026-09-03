# Teswa Backend Boundary — Final Lane Handoff

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Status

Backend decoupling implementation is complete for the current Teswa feature surface.

Supabase remains the active production provider.

No OCI cutover, production data migration, destructive schema change, or provider switch was performed in this lane.

## Validation baseline

Final implementation validation before this handoff:

- implementation HEAD: `08e5608d347a87abeade49740df0642026221dc1`
- GitHub Actions run: `33754388077`
- Backend boundary guard: **PASS**
- dependency install: **PASS**
- TypeScript / `tsc --noEmit`: **PASS**
- legacy direct Supabase client allowlist: **0 files**

The lane began with 65 feature-level direct imports of
`@/lib/supabase/client`.

The current boundary guard accepts zero legacy feature-level direct client imports.

## Runtime composition

Teswa feature code now reaches backend capabilities through
`teswaBackendRuntime` and Teswa-owned contracts.

Current runtime surfaces include:

- Auth
- Account lifecycle
- Profile / social graph
- Marketplace / listings / item discovery
- Offers
- Deals
- Media / object storage
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

Provider-specific Supabase implementation remains isolated under
`lib/backend/adapters/supabase/**` plus the existing provider client shell.

## Major migrated feature groups

### Auth

- Login
- Signup
- AuthProvider / session bootstrap
- external auth flows
- account lifecycle request boundary

### Media

- profile images
- item images
- item videos
- stories
- direct chat attachments
- voice messages
- Dolab media

### Profile / social

- profile setup/update
- direct-message privacy
- people directory
- followers/following
- blocks
- trust metrics
- badges
- connection lists
- profile image metadata

### Marketplace

- reads/detail/search paths previously migrated
- item likes
- My Listings
- archive/reactivate/delete lifecycle
- edit core
- edit images
- publish metadata
- item video metadata
- exchange item summaries
- video presence/discovery
- moving items
- item-story discovery
- pulse item teasers
- new-item count

### Offers / Deals / Messaging

- offer lifecycle
- deal lifecycle
- deal room realtime
- direct transport
- native direct messages/reactions/typing/delete
- contextual/story-reply messaging
- contextual voice messages
- deal inbox

### Stories / Discovery

- story publish/delete
- active story reads
- story author/viewer context
- likes
- views
- video drops
- City Pulse mixed discovery

### Product long tail

- Dolab item/media/note persistence and linking
- analytics event transport
- required policy acceptance persistence
- deal reviews
- user/item/story/deal/message reports
- admin report queue/actions
- account deletion edge-function request

## Boundary rule

The intended dependency direction is now:

```
Teswa feature / screen
        ↓
Teswa domain helper
        ↓
teswaBackendRuntime
        ↓
Teswa-owned contract
        ↓
provider adapter
        ↓
Supabase today / OCI implementation later
```

Feature code must not regain knowledge of:

- Supabase client instances
- Supabase session/user/error types
- PostgREST types
- table/view names
- RPC names
- storage bucket implementation details
- `postgres_changes`
- edge-function invocation syntax
- Supabase environment URLs/keys

The boundary checker is a ratchet and should remain enabled.

## OCI / migration lane dependency

The Oracle and Supabase-to-OCI lanes should implement the existing Teswa
contracts rather than rewriting screens/features again.

Key migration invariants to preserve:

- existing UUID identity
- auth/session behavior visible to product code
- current marketplace and profile result semantics
- offer/deal lifecycle outcome codes
- unread/read semantics
- direct/contextual/deal message behavior
- realtime event ordering and reconnect behavior
- media object-key ownership and signed/public URL behavior
- story expiration semantics
- policy acceptance versions
- moderation/report authorization and error semantics
- Dolab local-first fallback behavior
- analytics metadata privacy filtering

Provider adapters may change. Product-facing contracts should remain stable unless
a deliberate product/domain change is approved separately.

## Integration safety

Do not merge this branch directly to `main` without the designated integration
base/lane review.

A previous direct PR to main demonstrated that this branch sits on a broader
parallel-work commit chain. That PR was closed without merge.

Use the company parallel closure plan and integration lane for final assembly.

## Remaining work outside this lane

This lane does **not** claim:

- OCI adapters exist yet
- Oracle PostgreSQL schema/data migration is complete
- Supabase RPCs/functions have OCI equivalents yet
- realtime replacement has been production verified
- object storage copy/verification has been completed
- production traffic has moved away from Supabase

Those belong to the Oracle platform and Supabase-to-OCI migration lanes.

## Final lane result

The product code is no longer structurally tied to Supabase at feature level.

The active production implementation is still Supabase, but it now sits behind a
Teswa-owned provider boundary that can be replaced incrementally by OCI
implementations without another screen-by-screen backend rewrite.
