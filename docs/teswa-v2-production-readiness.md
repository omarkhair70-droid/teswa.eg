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
- Existing `send-notification-push` now allowlists `direct_message_received` and sends Expo push payload including the `/direct/{conversationId}` route from the notification row.
- Notification tap routing remains on existing mobile push route resolver path and opens `/direct/{conversationId}`.

### Manual setup required
- Deploy Edge Function: `stream-direct-message-webhook`.
- Set secret: `TESWA_STREAM_WEBHOOK_SECRET`.
- Configure Stream dashboard webhook URL to the deployed Supabase Edge Function URL.
- Configure custom header `x-teswa-stream-webhook-secret` if Stream webhook supports custom headers.
- If custom headers are unavailable in the Stream webhook surface you use, follow-up with signed webhook verification strategy (HMAC signature verification) before production enablement.

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
