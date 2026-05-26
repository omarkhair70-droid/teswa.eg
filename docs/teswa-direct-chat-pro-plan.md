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
