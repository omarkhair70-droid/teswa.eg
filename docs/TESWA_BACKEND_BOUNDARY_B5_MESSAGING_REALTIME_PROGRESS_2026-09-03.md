# Teswa Backend Boundary — B5 Messaging / Realtime Progress

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Slice B5.1 — Realtime provider boundary

Implemented a Teswa-owned Realtime capability for Messaging surfaces.

### Added

- `MessagingRealtimeContract`
- `createSupabaseMessagingRealtimeAdapter()`
- `teswaBackendRuntime.realtime`

### Migrated subscriptions

Provider-specific Realtime was removed from:

- `app/(tabs)/messages.tsx`
- `app/deal/[id].tsx`
- `app/contextual/[id].tsx`
- `lib/chat/supabase-direct-chat.ts` subscription creation

### Teswa-owned subscription capabilities

- Inbox change subscription
- Deal message/deal-state/confirmation subscription
- Contextual conversation message subscription
- Direct conversation/message/attachment/reaction/typing subscription

### Preserved behavior

- Inbox debounced reload
- Deal optimistic-message replacement
- Deal read-marker refresh
- Deal reconnect state
- Contextual message dedupe
- Contextual read-marker refresh
- Direct message/reaction/attachment/typing refresh semantics
- Direct realtime status UX

Supabase channel names, table names, `postgres_changes`, filters, channel status strings, and `removeChannel` ownership now live inside the Supabase Realtime adapter.

### Ratchet

The backend boundary checker now rejects feature-level:

- `postgres_changes`
- `.channel(`
- `removeChannel(`

outside the Supabase adapter/provider shell.

The three screens above no longer import the Supabase client.

### Not completed yet

B5.1 only closes Realtime transport. Direct/contextual messaging RPC/table CRUD is still migrated in later B5 slices.

No production provider switch was made.
