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

### Next step after lab

Build a secure backend token endpoint that mints short-lived Stream user tokens server-side, then have mobile fetch tokens at runtime instead of relying on static test token env values.
