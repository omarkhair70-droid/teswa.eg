# Teswa Lane 4 — Post-Push Runtime Prep — 2026-09-06

Standing point: Oracle rehearsal only. Supabase remains production authority. No production cutover or source mutation is authorized by this document.

## Green before this prep

- OCI infrastructure
- PostgreSQL 17 rehearsal target
- 5,600-row DB restore + deep checksum parity
- identity anchor / provider mappings / 21 identity FKs
- storage 154 objects / 126,519,319 bytes / SHA-256 parity
- Teswa transaction-local runtime identity context
- Direct Messaging RPC migration (15 functions)
- Direct Messaging participant RLS (5 policies)
- Realtime durable outbox + six source-table triggers
- Realtime loopback transport with auth and catch-up
- Notification push outbox

## Prepared while push worker is being verified

### Smart re-engagement replacement

Prepared files:

- `scripts/oci-migration/smart-reengagement-shadow-worker.py`
- `scripts/oci-migration/smart-reengagement-shadow-guest-deploy.sh`
- `scripts/oci-migration/deploy-runtime-smart-reengagement-shadow.sh`

The worker ports the currently active source semantics for:

- `reminder_offer_response_needed`
- `reminder_deal_coordination_needed`
- `reminder_deal_confirmation_pending`
- `reminder_unread_deal_message`
- `reminder_unread_contextual_message`
- `nudge_listing_refresh_or_media`

The source Edge Function already declares `digest_local_activity_pulse` and `nudge_return_to_teswa` deferred, so the Oracle replacement preserves that state rather than inventing new behavior.

Rehearsal defaults:

- hourly systemd timer
- `TESWA_SMART_APPLY=0`
- no notification/dispatch inserts from the timer
- no outbound push
- no Supabase runtime dependency
- local Unix-peer DB auth
- dedicated internal DB role with narrow table grants; BYPASSRLS is intentional because this replaces the former trusted service-role job that evaluates users globally

Production enablement is a later cutover action only after semantic parity and app authority gates.

## Remaining auth.uid runtime surface

Current Supabase production catalog still contains 58 public functions using `auth.uid()`. Fifteen Direct Messaging functions have already been ported on the OCI rehearsal target, leaving **43 function semantics** to port.

### Offers / deals / listings — 16

- `accept_offer`
- `archive_owned_listing_if_safe`
- `complete_deal_if_ready`
- `delete_owned_archived_listing_if_safe`
- `enforce_offer_insert_integrity`
- `enforce_offer_lifecycle`
- `get_unread_deal_messages_count`
- `guard_items_owner_update`
- `mark_deal_thread_read`
- `mark_offer_thinking`
- `reactivate_owned_archived_listing`
- `redirect_offer`
- `report_deal`
- `report_deal_message`
- `report_item`
- `soft_reject_offer`

### Social / trust / moderation — 12

- `follow_user`
- `get_my_badges`
- `get_my_trust_metrics`
- `get_user_block_state`
- `get_user_follow_state`
- `is_admin_user`
- `refresh_my_badges`
- `report_direct_message`
- `report_story`
- `report_user`
- `review_report`
- `unfollow_user`

### Notifications / analytics — 10

- `create_contextual_message_notification`
- two `create_notification` overloads
- `disable_my_push_device`
- `get_my_notification_preferences`
- `get_or_create_notification_preferences`
- `register_push_device`
- `set_my_notification_timezone`
- `track_analytics_event`
- `update_my_notification_preferences`

### Contextual / profile guards — 5

- `create_story_reply_thread`
- `ensure_story_reply_conversation`
- `get_unread_contextual_messages_count`
- `guard_profiles_self_update`
- `mark_contextual_thread_read`

Port rule: preserve the source function body and business semantics; replace request identity authority with `teswa_runtime.current_user_id()` / `require_user_id()` as appropriate. Do not recreate Supabase Auth as permanent compatibility authority.

## Remaining RLS surface

The current source has 82 public policies whose `USING` or `WITH CHECK` depends on `auth.uid()` across 41 tables. Five Direct Messaging SELECT policies are already ported on OCI, leaving **77 policies** for semantic porting.

The next RLS batches are intentionally ordered with their RPC domains so semantic tests can verify owner/non-owner, participant/non-participant, blocked, admin, and unauthenticated cases before moving to the next batch.

1. Offers / deals / listings and media ownership
2. Social / trust / moderation / stories / follows / blocks
3. Notifications / preferences / push devices / analytics-adjacent surfaces
4. Contextual conversations/messages and remaining self-owned/profile/policy surfaces

No bulk blind string replacement is allowed as the final gate; each batch must retain command, role, USING/WITH CHECK meaning, and target-role grants.

## Edge Function closure reality

The source repository has five Edge Function directories.

- `send-notification-push`: replacement path = Oracle push outbox + push worker.
- `run-smart-reengagement-notifications`: replacement path = Oracle smart worker + hourly systemd timer prepared above.
- `delete-account`: remains an Auth/account-lifecycle closure dependency. It performs storage cleanup, relational cleanup, and Auth-user deletion and must be replaced only after Oracle media + identity/session authority are wired together.
- `stream-chat-token`: already a 410 `retired_endpoint` stub in source; no new runtime replacement is needed.
- `stream-direct-message-webhook`: already a 410 `retired_endpoint` stub in source; no new runtime replacement is needed.

Therefore after push + smart worker parity, the only active Edge Function replacement still coupled to the later Auth closure is `delete-account`; the two Stream endpoints require retirement proof, not a new service.

## Ordered continuation

1. Verify push worker rehearsal.
2. Deploy/verify smart re-engagement dry-run timer.
3. Port 43 remaining `auth.uid()` function semantics in guarded domain batches.
4. Port 77 remaining RLS policies in the same domain batches with semantic probes.
5. Mark Stream stubs retired after Oracle-native chat authority proof.
6. Close `delete-account` with Auth + OCI media deletion semantics.
7. Wire Lane 2 Teswa-owned contracts to Oracle API/runtime.
8. Complete Auth flows and full app E2E.
9. Fresh final capture, write freeze, parity, cutover, zero-Supabase proof, rollback/smoke window, then source retirement.
