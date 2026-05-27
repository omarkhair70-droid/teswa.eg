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
