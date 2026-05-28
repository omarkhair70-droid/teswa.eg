# Teswa Mobile — V2 Production Readiness (Sprint 0)

## Implemented (current baseline)
- **Supabase ownership:** auth, profiles, items, offers, deals, and conversation metadata.
- **Stream ownership:** accepted Direct Chat runtime (Direct Chat Pro path).
- **Expo Notifications ownership:** push token registration and notification-tap route foundation.
- **Guardrails added in this sprint:** local feature flags for Direct Chat Pro, Swap Ceremony, Direct in-app video player, and push registration.

## Foundation only (partially complete)
- Push notifications are registered on device and can resolve safe in-app routes on tap.
- Stream chat token wiring is available for client authentication.

## Not implemented yet (required hardening)
- Stream token function must enforce server-side validation for `conversationId` and `otherUserId` before issuing tokens.
- Push delivery end-to-end still requires Stream provider/webhook delivery completion.
- Report/moderation backend is still required.
- CI pipeline gates are still required.
- Manual QA matrix and release sign-off are still required.

## Release rules
- No production OTA release unless both `npm run typecheck` and `npx expo-doctor` pass.
- Native config changes require a new native build (cannot rely on OTA only).
- Release flow: preview validation first, then production promotion after verification.


## Direct Chat Pro — Stream Token Hardening (Sprint 1)

- Edge Function `stream-chat-token` now validates Direct Chat token context against `public.direct_conversations` server-side before any other-user Stream upsert.
- `conversationId` is now required for any request that wants other-user upsert behavior; the other participant is derived on the server from `participant_a`/`participant_b`, never trusted from mobile input.
- Warmup token calls without `conversationId` are still allowed for current-user token minting, but they do **not** upsert arbitrary `otherUserId`.
- Validation failures return safe Arabic messages:
  - unauthorized/not participant: `غير مسموح بفتح هذه المحادثة.`
  - not accepted: `المحادثة غير جاهزة للشات الجديد.`
  - invalid other user: `تعذر تحديد الطرف الآخر في المحادثة.`
- Sensitive values (Stream token, Stream secret, service role key) are not logged or returned in error payloads.

### Required Edge Function Secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for secure server-side direct conversation validation)
- `STREAM_CHAT_API_KEY`
- `STREAM_CHAT_SECRET`

### Manual Verification Checklist

- [ ] Accepted conversation + valid participant token request succeeds.
- [ ] Requested conversation token request fails for Direct Chat Pro (`المحادثة غير جاهزة للشات الجديد.`).
- [ ] Unrelated user cannot mint token for a conversation they do not participate in (`غير مسموح بفتح هذه المحادثة.`).
- [ ] `otherUserId` mismatch vs derived participant fails (`تعذر تحديد الطرف الآخر في المحادثة.`).
- [ ] Warmup call with no `conversationId` succeeds for current user token and does not upsert arbitrary other users.

## Direct Chat Push Delivery (Sprint 2)

### Implemented
- Added Edge Function `stream-direct-message-webhook` to receive Stream direct-message webhook events, validate accepted direct conversation membership server-side, enforce block safety, dedupe by Stream message id, and create one Supabase notification for the recipient.
- Added internal-only `direct_push_events` dedupe table (service-role usage only; RLS enabled and anon/authenticated revoked).
- Webhook retry behavior is dedupe-safe and recoverable: duplicate Stream message ids are skipped, and if notification insert fails the event row is removed so retries are not permanently blocked.
- Existing `send-notification-push` now allowlists `direct_message_received` and sends Expo push payload including the `/direct/{conversationId}` route from the notification row.
- Notification tap routing remains on existing mobile push route resolver path and opens `/direct/{conversationId}`.
- `public.notifications.route` is the deep-link routing field for direct-message pushes and is now part of the required DB contract for Sprint 2 delivery.

### Manual setup required
- Deploy Edge Function: `stream-direct-message-webhook`.
- Set secret: `TESWA_STREAM_WEBHOOK_SECRET`.
- Configure Stream dashboard webhook URL to the deployed Supabase Edge Function URL.
- Configure custom header `x-teswa-stream-webhook-secret` if Stream webhook supports custom headers.
- Stream dashboard webhook surfaces may not support custom headers; in that case configure the webhook URL with `?secret=...` using `TESWA_STREAM_WEBHOOK_SECRET`.
- Treat webhook URL secrets as sensitive: rotate immediately if exposed, and never paste the secret into screenshots/chats.

### Required secrets
- `TESWA_STREAM_WEBHOOK_SECRET`
- `TESWA_PUSH_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `STREAM_CHAT_API_KEY` / `STREAM_CHAT_SECRET` (remain scoped to Stream token function)

### Manual QA
- [ ] User B has push permission enabled and an active Expo push token saved.
- [ ] User A sends a direct Stream text message in an `accepted` conversation.
- [ ] A `notifications` row is created for User B with route `/direct/{conversationId}`.
- [ ] `send-notification-push` processes the row.
- [ ] User B receives push in background/killed state.
- [ ] Push tap opens `/direct/{conversationId}`.
- [ ] `requested` / non-accepted direct conversations do not notify.
- [ ] Blocked user pairs do not notify.
- [ ] Duplicate webhook retry for same `streamMessageId` does not create duplicate notification.

## Sprint 3 — Offers/Deals State Machine

### Audit summary (schema + app usage)
- **Offers statuses currently used by app and RPC paths:** `pending`, `thinking`, `accepted`, `soft_rejected`, `redirected`, `withdrawn`, `expired`, `cancelled_after_accept`.
- **Deals statuses currently used by app and RPC paths:** `coordinating`, `completed_pending_confirmation`, `completed`, `cancelled`, `disputed`.
- **Known transitions observed before hardening:** client guarded some actions but could still race against stale states; server functions required stronger transition checks.
- **Unsafe gaps found:**
  - Mobile action guards were partly duplicated and not centralized.
  - Deal completion logic relied on pre-checks in mobile; terminal-state handling needed consistent server-side protection.
  - Ceremony route moments could appear from route params without full status verification.

### Hardening delivered
- Added shared pure state-machine helpers in `lib/exchange-state-machine.ts` and wired mobile action guards to canonical transition checks.
- Hardened RPCs (`mark_offer_thinking`, `soft_reject_offer`, `complete_deal_if_ready`) with participant validation, transition validation, and terminal-state protection.
- Prevented invalid client-side actions from showing optimistic success by surfacing a unified Arabic message on invalid state: `لا يمكن تنفيذ الإجراء على الحالة الحالية.`
- Tightened Swap Ceremony rendering so accepted/completed moments only render when backed by real state.

### Manual QA matrix
- [ ] create offer
- [ ] accept offer
- [ ] reject offer
- [ ] cancel offer if supported
- [ ] accepted offer cannot be rejected afterward
- [ ] rejected offer cannot be accepted afterward
- [ ] accepting an offer creates at most one deal
- [ ] deal completion requires valid participant
- [ ] completed deal cannot be completed twice
- [ ] cancelled deal cannot be completed
- [ ] unauthorized user cannot mutate offer/deal
- [ ] Swap Ceremony appears only for real states

## Sprint 5 — Premium Push Payloads

### Implemented
- `send-notification-push` now enriches payloads with actor identity when `actor_user_id` is present by reading `public.profiles (id, display_name, username, avatar_url)` and deriving a safe actor name fallback (`مستخدم على تِسوى`).
- Added type-specific premium copy builder for key notification types (`direct_message_received`, `deal_message_received`, `deal_voice_message_received`, `offer_received`, `offer_accepted`, `user_followed_you`, `report_update`) with conservative fallback to existing row title/body.
- Added safe avatar payload foundation: HTTPS-only avatar URL is attached as Expo `image` and duplicated in `data.actorAvatarUrl`; invalid/non-HTTPS values are ignored.
- Added push payload hardening for Android delivery metadata: `sound: "default"` for all pushes and `priority: "high"` only for `direct_message_received` and `deal_message_received`.
- Routing contract is preserved and reinforced: payload data always includes `notificationId` + `notificationType`, keeps `route` when present, keeps `actorUserId` when present, and safely derives route from `deal_id`/`offer_id`/`item_id` only when explicit route is missing.

### Notification settings reality check
- Notification settings are **real backend-backed preferences**, not UI-only.
- Backing schema/functions exist in `public.notification_preferences` with authenticated RPCs (`get_my_notification_preferences`, `update_my_notification_preferences`) and category toggles (`offers_enabled`, `deals_enabled`, `messages_enabled`, `social_enabled`, `smart_reminders_enabled`, ...).
- `send-notification-push` now respects basic preference categories at send time:
  - direct messages → `messages_enabled`
  - offers/deals → `offers_enabled` + `deals_enabled`
  - social/activity → `social_enabled`
  - reminders → `smart_reminders_enabled`

### Push coverage audit
- **Push-supported (allowlisted in `send-notification-push`):**
  - `offer_received`
  - `offer_thinking`
  - `offer_accepted`
  - `offer_soft_rejected`
  - `offer_redirected`
  - `deal_created`
  - `deal_message_received`
  - `deal_voice_message_received`
  - `deal_completion_confirmation_needed`
  - `deal_completed`
  - `deal_cancelled`
  - `story_reply_received`
  - `contextual_message_received`
  - `report_update`
  - `system`
  - `reminder_offer_response_needed`
  - `reminder_deal_coordination_needed`
  - `reminder_deal_confirmation_pending`
  - `reminder_unread_deal_message`
  - `reminder_unread_contextual_message`
  - `nudge_listing_refresh_or_media`
  - `digest_local_activity_pulse`
  - `nudge_return_to_teswa`
  - `user_followed_you`
  - `direct_message_received`
- **In-app only types:** none currently identified outside the push allowlist.
- **Follow-up audit item:** keep allowlist synced with future `public.notification_type` enum additions and confirm each new type has safe route contract + copy policy before enabling push.

### Explicitly not implemented
- Direct reply from notification.
- React from notification.
- Native notification actions.
- Any Stream runtime or Direct Chat runtime rewrites.
- Any new native channel creation or native config changes.

### Manual QA
- [ ] Direct message notification shows sender name.
- [ ] Direct message opens direct chat.
- [ ] Offer notification shows actor name.
- [ ] Deal message notification opens deal.
- [ ] Avatar/image does not break push rendering.
- [ ] Missing actor profile falls back safely to existing copy.
- [ ] Disabled/invalid device token handling still works.

### Acceptance
- [ ] `npm.cmd run typecheck` passes.
- [ ] `npx.cmd expo-doctor` passes.
- [ ] `send-notification-push` deploys.
- [ ] Direct message push shows sender-aware copy.
- [ ] Offer/deal/social pushes have clearer copy.
- [ ] Existing direct push delivery remains working.
- [ ] No new libraries.
- [ ] No native build required unless documented.
- [ ] No direct reply/react actions in this PR.
