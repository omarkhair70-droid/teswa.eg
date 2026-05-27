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
