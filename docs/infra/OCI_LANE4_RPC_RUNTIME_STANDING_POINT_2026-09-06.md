# Teswa Lane 4 — RPC / Runtime Standing Point — 2026-09-06

## Safety state

- Supabase remains production authority.
- No production cutover in this work.
- Storage rehearsal may run independently in Cloud Shell.
- Identity persistence on `teswa_rehearsal` is already GREEN: 32 users, 32 provider mappings, 21 validated identity FKs.
- This document records the next independent runtime lane; it does not declare runtime parity complete.

## Live Supabase runtime inventory

Read-only production catalog inspection on 2026-09-06 confirmed:

- 80 `public` functions total.
- 72 `SECURITY DEFINER` functions.
- 58 functions currently reference `auth.uid()`.
- 0 public functions currently reference `auth.users` directly.
- 1 public function currently references `storage.*` directly (`validate_direct_message_attachment_object_v2`).
- 99 `public` RLS policies total.
- 82 RLS policies reference `auth.uid()`.
- Those 82 policies span 41 public tables.

These counts are the runtime migration surface, not an instruction to blindly rewrite every definition.

## Runtime identity direction

The OCI server must establish authenticated identity inside the database transaction, not through a client-controlled permanent connection setting.

Canonical transaction pattern:

```sql
BEGIN;
SELECT set_config('teswa.user_id', '<verified Teswa UUID>', true);
-- execute business query / RPC
COMMIT;
```

The third `set_config` argument is deliberately `true`: the setting is transaction-local and therefore cannot survive release of a pooled connection.

The Teswa-owned replacement primitive lives in:

- `scripts/oci-migration/runtime-current-user-context.sql`
- `scripts/oci-migration/verify-runtime-current-user-context.sql`

`teswa_runtime.current_user_id()` intentionally mirrors the nullable behavior needed by RLS checks; `teswa_runtime.require_user_id()` is for server/RPC paths that require authentication.

## Migration rule

Do **not** install a permanent fake Supabase Auth provider or keep Supabase session semantics as architectural authority. Existing `auth.uid()` usages are to be migrated to the Teswa runtime identity primitive while preserving each function/policy's exact business semantics.

Required conversion order:

1. Install and verify transaction-local Teswa runtime identity primitive on rehearsal DB.
2. Capture canonical live function/policy definitions at a single source watermark.
3. Classify each `auth.uid()` dependency by surface: RPC, trigger, RLS, notification/worker, realtime/message path.
4. Adapt definitions to `teswa_runtime.current_user_id()` / `require_user_id()` as appropriate.
5. Apply to isolated rehearsal runtime layer.
6. Run semantic parity tests as authenticated user A, authenticated user B, unauthenticated caller, blocked-user cases, owner/non-owner cases, and admin paths where relevant.
7. Only after runtime parity is GREEN should the OCI app adapter become authority.

## High-value function groups already identified

### Direct messaging / realtime-adjacent

`accept_direct_message_request`, `ignore_direct_message_request`, `get_direct_conversation`, `get_direct_conversation_messages`, `get_direct_native_messages`, `get_my_direct_conversations`, `mark_direct_conversation_read_v2`, `send_direct_message`, `send_direct_native_message`, `send_direct_voice_message`, `set_direct_typing_state_v2`, `toggle_direct_message_reaction_v2`, `start_direct_conversation_with_message`, `start_or_get_direct_conversation`, `delete_direct_message_v2`.

### Offers / deals / listings

`accept_offer`, `complete_deal_if_ready`, `archive_owned_listing_if_safe`, `delete_owned_archived_listing_if_safe`, `reactivate_owned_archived_listing`, `mark_offer_thinking`, `redirect_offer`, `soft_reject_offer`, `mark_deal_thread_read`.

### Social / trust / moderation

`follow_user`, `unfollow_user`, `get_user_block_state`, `get_user_follow_state`, `get_my_badges`, `refresh_my_badges`, `get_my_trust_metrics`, `is_admin_user`, reporting/review functions.

### Notifications / analytics

`create_notification` authenticated overloads, `get_my_notification_preferences`, `get_or_create_notification_preferences`, `update_my_notification_preferences`, `set_my_notification_timezone`, `register_push_device`, `disable_my_push_device`, `track_analytics_event`.

## Current standing point

Database/data parity and identity persistence are already closed. Storage byte parity is running independently. The next executable runtime step is the guarded rehearsal install + verification of the Teswa transaction-local user context, then canonical capture/adaptation of the 58 function and 82 policy `auth.uid()` dependencies.
