# Teswa Production Infrastructure

This document is the source-of-truth inventory for production-owned Supabase Edge Functions.

## Active functions

| Function | Ownership | Authentication | Purpose |
| --- | --- | --- | --- |
| `delete-account` | active | JWT required | Authenticated account deletion |
| `send-notification-push` | active | webhook secret in function body | Deliver allowlisted Expo push notifications created by trusted database/webhook paths |
| `run-smart-reengagement-notifications` | active | scheduled/internal secret contract | Periodic smart re-engagement notification dispatch |

## Retired compatibility endpoints

The following names existed during the Stream Direct Chat era. The mobile runtime is now Supabase-native and no current app path depends on these services.

| Function | State | Production behavior |
| --- | --- | --- |
| `stream-chat-token` | retired | JWT-gated tombstone returning HTTP 410; does not read Stream or service-role secrets |
| `stream-direct-message-webhook` | retired | JWT-gated tombstone returning HTTP 410; does not read webhook, Stream, or service-role secrets |

The retired names remain represented in source control until the deployed Edge Function records can be physically deleted from the Supabase project. They must never be restored to their historical privileged implementations.

## Direct Chat ownership

Direct Chat authentication and runtime are Supabase-native:

- `lib/chat/direct-runtime-auth.ts` resolves the current Supabase session directly.
- legacy-named `lib/chat/stream-token.ts` is only a compatibility alias and makes no Stream request.
- legacy-named `lib/chat/stream-client.ts` delegates to the Supabase-native Direct Chat runtime.
- message persistence, attachments, reactions, typing and realtime behavior are backed by the Supabase-native Direct Chat database/storage contract.

Compatibility naming inside the large Direct Chat screen is technical debt only and should be removed during the Direct Chat architecture consolidation PR, not by reintroducing Stream infrastructure.

## Deployment rule

A deployed Edge Function that is not represented here and under `supabase/functions/` is production drift and must be investigated before release.

Retired functions must use `verify_jwt=true`, must not access privileged secrets, and must return a terminal response without performing side effects.

## Operational follow-up

When Supabase function deletion is available in the deployment tooling, physically delete both retired Stream function records and rotate/remove any no-longer-used Stream/webhook secrets. Until then, the tombstones close the executable privileged surface while preserving an auditable source-of-truth state.
