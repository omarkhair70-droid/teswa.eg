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
