# Teswa Direct Chat Pro — Stream Chat Expo Foundation Plan

## Current direct chat architecture (today)

Teswa currently runs direct chat through the custom screen at `app/direct/[id].tsx` backed by Supabase direct-message data flows. The existing implementation includes:

- Supabase-backed direct messages
- Text messaging
- Voice recording and playback via `expo-audio`
- Request / accept / ignore direct-chat flow
- User block / unblock controls
- Direct voice message upload and signed URL playback

This foundation PR intentionally does **not** replace or modify that runtime behavior.

## Why Stream Chat Expo

`stream-chat-expo@beta` is a strong fit for a premium direct chat experience because it provides production-grade chat primitives and infrastructure support for:

- Message lists and composer UX
- Attachments/media patterns
- Reactions, replies, read/typing state
- Audio message workflows
- Better offline/state handling patterns than ad hoc UI state

## Installed packages for foundation

Planned install command:

```bash
npx expo install stream-chat-expo@beta @react-native-community/netinfo react-native-teleport
```

Notes:

- Keep existing dependencies already present in this repo (gesture-handler, reanimated, svg, worklets, Expo media modules, etc.).
- Add only missing packages required for Stream Chat Expo foundation.
- Do not add secrets and do not require Stream keys/tokens for local app boot.

## Backend token requirement (must-have before runtime integration)

A secure backend endpoint must mint Stream user tokens server-side. The frontend must never embed or hardcode Stream app secret.

High-level requirement:

- Frontend sends authenticated Teswa session to backend.
- Backend verifies Teswa identity, maps user identity to Stream user id, and returns short-lived Stream token.
- Frontend connects Stream client with API key + user token obtained from backend.

## Teswa user mapping to Stream users

Suggested mapping strategy:

- Use stable Teswa user UUID as Stream `id` (string-safe).
- Store display metadata (`name`, `image`) from Teswa profile at connection/update time.
- Keep mapping deterministic to avoid duplicate Stream users.

## Coexistence plan with current Supabase direct messages

Phase rollout strategy:

1. Foundation: install SDK and add adapter/config/types (this PR).
2. Feature-flag provider selection so existing direct chat remains default.
3. Add parallel Stream-backed direct chat screen/route for internal QA only.
4. Validate parity for text + voice + request flow behavior.
5. Controlled pilot rollout before considering migration decisions.

During coexistence, Supabase direct messaging remains the active production source of truth.

## Rollback plan

- Keep default provider pinned to Supabase.
- Guard Stream usage behind disabled feature flag until backend token endpoint and QA are complete.
- If any issue appears, disable Stream flag and continue using existing direct chat with no schema/data migration impact.

## Non-goals for this PR

- No replacement of `app/direct/[id].tsx`
- No Stream UI runtime integration in the app tree
- No app-wide `Chat` provider wiring
- No message migration
- No navigation behavior changes

## Internal Stream runtime lab route (safe verification)

A dedicated internal lab screen now exists at:

- `/chat-lab/stream`

Purpose:

- Verify Stream Chat SDK runtime loading in-app
- Verify API key wiring from Expo public env
- Verify test user connection with a test token
- Verify channel initialization/watch flow

This lab is intentionally isolated from production direct chat and does not replace or modify `app/direct/[id].tsx`.

### Required env vars for lab validation

These are optional for app startup and only used by the lab route:

- `EXPO_PUBLIC_STREAM_CHAT_API_KEY`
- `EXPO_PUBLIC_STREAM_CHAT_TEST_USER_ID`
- `EXPO_PUBLIC_STREAM_CHAT_TEST_USER_TOKEN`
- `EXPO_PUBLIC_STREAM_CHAT_TEST_CHANNEL_ID` (optional; falls back to an internal test id)

Safety defaults:

- `STREAM_CHAT_ENABLED` remains `false` by default.
- Without env vars, app startup remains unaffected and the lab route shows safe missing-config states.

### Local test steps

1. Keep current direct chat route unchanged and continue using Supabase-backed chat as the production source of truth.
2. Add Stream test env vars in local Expo env (do not commit real tokens).
3. Temporarily enable Stream runtime lab by toggling `STREAM_CHAT_ENABLED` in `lib/chat/stream-chat-config.ts` for local verification only.
4. Run app and open `/chat-lab/stream`.
5. Confirm status cards reach ready state:
   - SDK loaded
   - API key found
   - Test user connected
   - Channel ready
6. Revert local test token values and keep Stream disabled by default in committed code.

### Supabase Edge Function token flow

Edge Function: `supabase/functions/stream-chat-token/index.ts`

Server-side required env vars (Supabase project secrets, never frontend):

- `STREAM_CHAT_API_KEY`
- `STREAM_CHAT_SECRET`

Setup notes by environment:

- **Local:** set function secrets with `supabase secrets set STREAM_CHAT_API_KEY=... STREAM_CHAT_SECRET=...` before `supabase functions serve stream-chat-token`.
- **Preview/Staging:** configure the same keys in the preview Supabase project secrets and deploy function there.
- **Production:** configure production project secrets and deploy function only after pilot readiness signoff.

Security rules:

- Never expose `STREAM_CHAT_SECRET` in `EXPO_PUBLIC_*` variables.
- Never hardcode Stream user tokens in committed frontend code.
- App startup must remain safe when Stream env vars are absent; Stream lab should show a missing-config state or fallback status.
- Edge function should support CORS preflight (`OPTIONS`) and return consistent JSON (`ok: true` success, `ok: false` errors).

### Next step: Stream Direct Chat Pilot

Run an internal pilot route powered by backend-minted Stream tokens while keeping Supabase direct chat as the unchanged production default.

## Internal Stream direct pilot route

A dedicated internal pilot route now exists at:

- `/chat-lab/direct-pilot`

Scope and safety:

- This screen is **internal-only** and does not replace or alter `app/direct/[id].tsx`.
- It uses backend-minted Stream tokens via `fetchStreamChatToken()`.
- It does not touch Supabase direct-message tables, schemas, or message history.
- It does not add global Stream provider wiring or production navigation entries.

Pilot behavior:

- Fetches `{ apiKey, userId, token }` from the existing Supabase Edge Function token flow.
- Connects one Stream user and watches a stable one-user pilot channel:
  - type: `messaging`
  - channel id: `teswa-direct-pilot-{userId}`
  - members: `[userId]`
- Renders status cards for:
  - backend token fetched
  - user connected
  - channel ready
  - UI mode
- Supports a minimal fallback composer and send flow with `channel.sendMessage({ text })` for runtime SDK validation.

Failure mode requirements:

- If backend token fetch fails (missing/dead function or missing server secrets), the route shows a safe `EmptyState` error and does not crash app startup.

### Next phase (after pilot validation)

- Map real two-user direct conversations to deterministic Stream channel IDs derived from current direct conversation IDs.
- Keep coexistence with Supabase direct chat until parity and rollout readiness are proven.
- Evaluate phased opt-in routing only after internal pilot KPIs pass.

## Real conversation mapping lab (internal-only)

A second internal lab route is added for real Supabase direct conversations:

- `/chat-lab/direct-conversation?conversationId=...`

This route is for mapping verification only and keeps production direct chat unchanged.

Mapping contract:

- Stream channel type: `messaging`
- Stream channel id format: `teswa-direct-{conversationId}`
- Channel id is sanitized deterministically from `conversationId` (trimmed, lowercased, safe chars only)
- Members are mapped as:
  - current authenticated user id (from backend-minted Stream token)
  - `otherUserId` returned by `fetchDirectConversation(conversationId)`

Safety and behavior:

- If `conversationId` query param is missing, the route shows a safe empty state.
- If the Supabase conversation is missing, the route shows a safe empty state.
- If status is `ignored` or `blocked`, show safe state copy and do not enable sending.
- If status is `requested`, watch is allowed for internal mapping validation but composer stays disabled.
- Composer is enabled only when status is `accepted`.

Explicit non-goals for this phase:

- No replacement of `app/direct/[id].tsx`
- No changes to existing `sendDirectMessage` production behavior
- No database migrations for Stream mapping
- No message backfill from Supabase to Stream
- No global Stream provider wiring
- No production navigation entry

### Next phase

- Add a dev-only entry point from the existing direct screen to launch the two-user Stream pilot behind a local flag/button.
- Continue coexistence until parity and rollout readiness are proven.

## Direct Chat Pro V1 (real integration in `app/direct/[id].tsx`)

This phase is now the first real user-facing Direct Chat Pro implementation.

### Responsibility split (authoritative)

- **Supabase remains source of truth for:**
  - direct conversation existence/lookup
  - participant identity/profile preview
  - direct status lifecycle (`requested`, `accepted`, `ignored`, `blocked`)
  - request accept/ignore and block/unblock logic
- **Stream powers accepted-conversation chat runtime for:**
  - new text messages
  - realtime channel state and message list rendering foundation

### Runtime behavior in V1

- Route: `app/direct/[id].tsx`.
- Feature flag: `DIRECT_CHAT_PRO_ENABLED` local constant.
- Conversation metadata is always fetched first from Supabase.
- For `requested`, `ignored`, or `blocked`:
  - no Stream token fetch
  - no Stream user connect
  - no Stream channel watch
  - existing request/status UX remains active.
- For `accepted` and feature flag enabled:
  - fetch backend-minted Stream token (`fetchStreamChatToken()`)
  - connect Stream user via dynamic SDK import (`import('stream-chat-expo')`)
  - map/watch deterministic direct channel `messaging:teswa-direct-{conversationId}` via direct mapping helper
  - render Direct Chat Pro text list/composer from Stream channel state.

### Fallback and safety

- If Stream token/connect/watch fails, app does not crash.
- User sees soft notice: `الشات الجديد مش متاح دلوقتي. جرّب تاني بعد لحظات.`
- Screen keeps Supabase message fallback flow available for resilience.

### Deferred to next PRs

- attachments/media composer
- voice messaging in Stream composer
- typing indicators
- read receipts
- reactions/replies and richer premium polish

## Direct Chat Pro V1.1 — Premium Chat Shell UI

This phase upgrades the visual shell and interaction polish of `app/direct/[id].tsx` while keeping the existing Direct Chat Pro V1 runtime contract unchanged.

Scope in V1.1:

- UI/UX polish only (header, context strip, status cards, message bubbles, composer presentation)
- Arabic-first premium shell for accepted conversations
- Non-accepted states (`requested`, `ignored`, `blocked`) remain governed by existing conversation status logic

Explicitly unchanged in V1.1:

- Stream runtime logic for accepted conversations
- Supabase as source of truth for direct conversation metadata/status
- Message storage behavior
- No attachments, no voice sending, no reactions
- No typing/read/delivery/presence rollout in this phase
- No Story Thread or Deal Chat changes

## Direct Chat Pro V1.2 — Stream Realtime Layer

This phase upgrades realtime behavior in `app/direct/[id].tsx` for accepted Direct Chat Pro conversations, while keeping existing architecture and guardrails intact.

Implemented in V1.2:

- Safer Stream event subscription lifecycle with explicit unsubscribe handling on cleanup/reconnect to avoid duplicate handlers.
- Better channel hydration from `channel.state?.messages ?? []` with defensive mapping, stable sort, and malformed-payload tolerance.
- Typing indicator support (when SDK shape supports typing events/methods) with throttled keystroke signaling.
- Clear internal connection states (`idle`, `connecting`, `ready`, `unavailable`) for more accurate user-facing copy.
- Conservative delivery/read awareness for my messages:
  - `جارٍ الإرسال`
  - `اتبعثت`
  - `اتقرت` (only when safely inferable from Stream read state)
- Presence basics in header secondary line when online availability is exposed safely (`متصل الآن`), with existing fallback copy otherwise.

Explicitly unchanged in V1.2:

- No DB schema changes
- No request/accept/ignore/block behavior changes
- No Stream initialization for non-accepted conversations
- No attachments/voice/reactions/replies rollout
- No Story Thread or Deal Chat changes
- Accepted Direct Chat Pro send path remains Stream-only (no Supabase fallback)

## Direct Chat Pro V1.3 — Message Actions

This phase adds a polished message-actions layer for accepted Direct Chat Pro conversations in `app/direct/[id].tsx` using Stream capabilities where available, with defensive API checks.

Implemented in V1.3:

- Long-press message actions (Arabic-first) for Stream messages:
  - `نسخ النص`
  - `رد على الرسالة`
  - `تفاعل ❤️`
  - `تفاعل 👍`
  - `إبلاغ عن الرسالة`
  - `حذف الرسالة` (own messages only)
- Reactions foundation:
  - send `love` and `thumbs_up` via Stream reaction API when available
  - compact reaction chips under bubbles (`❤️`, `👍`) from Stream reaction counts
- Reply foundation:
  - set reply target from action sheet
  - composer-level reply preview card with clear/close affordance
  - attempt quoted send with `quoted_message_id` on Stream message send
  - safe fallback to plain Stream send when quoted payload typing/runtime shape is unavailable
- Copy/report/delete safe handling:
  - text copy via `expo-clipboard`
  - report action currently surfaces safe local feedback (`تم تسجيل البلاغ للمراجعة.`) without backend moderation wiring
  - delete action hidden/disabled for non-owner messages and guarded by Stream API availability checks
- Inline action feedback state (soft local UX) to avoid alert spam.

Explicitly unchanged in V1.3:

- No DB/schema changes
- No request/accept/ignore/block behavior changes
- No Stream init for non-accepted conversations
- Accepted Direct Chat Pro sends remain Stream-only (no Supabase fallback)
- No attachments, no voice rollout, no Deal Chat changes, no Story Thread changes

## Direct Chat Pro V1.4 — Attachments & Media

This phase adds production-safe attachments/media UX for accepted Direct Chat Pro conversations in `app/direct/[id].tsx`, while preserving all existing architecture boundaries.

Implemented in V1.4:

- Composer attachment entry is now active only in accepted+ready Stream state (no activation for non-accepted conversations).
- Attachment picker actions (Arabic-first):
  - `صورة`
  - `فيديو`
  - `ملف`
  - `إلغاء`
- Image pick + preview + send:
  - one-image selection via `expo-image-picker`
  - local pending preview before send
  - Stream upload/send flow only for accepted Direct Chat Pro
- Video pick + preview + send:
  - one-video selection via `expo-image-picker`
  - pending preview card and send controls
  - Stream upload/send flow with defensive method checks
- Document/file pick + preview + send:
  - one-file selection via `expo-document-picker`
  - compact pending file card
  - Stream upload/send flow with safe error handling
- Stream message mapping now includes defensive attachment parsing (`type`, URLs, title/name, mime, size).
- Media bubble rendering in chat:
  - image thumbnails (compact premium style)
  - video/file compact cards with Arabic labels
  - safe tap feedback for not-yet-implemented open/view flows
- Upload/send failure handling:
  - Arabic-friendly feedback copy
  - pending attachment retained on failure for retry/remove
  - media sending state (`جاري إرسال الميديا...`) and composer send disabling while upload/send is in progress
- Reply + media/text behavior:
  - attempt quoted Stream send first when reply target exists
  - safe Stream-only fallback to non-quoted send on quoted-send failure
  - no Supabase fallback for accepted Direct Chat Pro

Explicitly unchanged in V1.4:

- No DB/schema changes
- No request/accept/ignore/block behavior changes
- No Stream init for non-accepted conversations
- No voice message implementation in this phase
- No Dolab bridge / Offer Cards rollout
- No Story Thread or Deal Chat changes

## Next phase

- **Direct Chat Pro V1.5 — Voice Messages**

## Direct Chat Pro V1.5 — Voice Messages

- Added voice recording in accepted Direct Chat Pro composer with clear recording state (`جاري التسجيل...`) and timer.
- Added safe cancel and send controls for recording (`إلغاء` / `إرسال`) with cleanup-first behavior.
- Voice upload/send now goes through Stream only using file upload + audio attachment payload (no Supabase fallback).
- Stream message hydration now parses audio attachment metadata defensively (`type`, `asset_url`, `mime_type`, `file_size`, `duration`).
- Audio attachments render as dedicated voice bubbles (not generic files) with `رسالة صوتية`, play/pause icon, and duration when available.
- Added safe playback handling with single-active playback and user-friendly error feedback.
- Added permission/error feedback for mic denial and send/play failures without alert spam.

### Next Phase
- Direct Chat Pro V1.6 — Composer Actions + Dolab Bridge
