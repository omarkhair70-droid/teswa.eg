# Teswa Expo 57 Platform Modernization — M0 Baseline

Date: 2026-09-03
Branch: `modernize/expo57-platform-20260903`
Baseline commit: `723fc99e391f7ab43f9ab38e183da8d5888d1912`

## Production safety boundary

This lane is isolated from the v24 production hotfix.

Known-good Play-signed v24 device smoke:
- Google native sign-in: PASS
- signup/login: PASS
- feed/profile images: PASS
- direct chat: PASS
- gallery picker / add media: PASS
- tabs/navigation: PASS

Do not merge this modernization lane until its own native + Play-signed smoke is complete.

## Current platform

- Expo: `~55.0.31`
- React Native: `0.83.10`
- React: `19.2.0`
- Expo Router: `~55.0.18`
- Reanimated: `4.2.1`
- Worklets: `0.7.4`
- Screens: `~4.23.0`
- Gesture Handler: `~2.30.0`
- MMKV: `^4.3.1`
- Nitro Modules: `^0.35.7`

Android release hotfix state:
- release minification: OFF
- resource shrinking: OFF
- custom optimized ProGuard injection: OFF

## Target

Move through supported SDK checkpoints:
1. SDK 55 -> SDK 56
2. SDK 56 -> SDK 57 latest stable patch
3. Align Expo-managed package cohort
4. Audit/update third-party native dependencies
5. Remove the emergency R8 rollback plugin and use the target SDK's generated Android release model
6. Restore release optimization only after runtime verification
7. Re-establish mapping + 16 KB + real native release CI
8. Production APK smoke -> Play Internal -> Production

## M0 audit findings

### Expo Router migration risk: LOW

Repo search finds no application-code imports from `@react-navigation/*`.

SDK 56+ no longer supports those direct imports from app code, so Teswa already avoids the primary Router migration blocker.

Reference:
https://docs.expo.dev/router/migrate/sdk-55-to-56/

### FileSystem migration risk: LOW/MODERATE

Teswa actively uses the modern object API:
- `File`
- `Directory`
- `Paths`

Examples exist in chat media, Dolab media, draft media, uploads, and deal flows.

This reduces legacy FileSystem migration exposure, but runtime smoke remains required because file/media flows are core product paths.

### Hermes / Reanimated

SDK 56 uses React Native 0.85 and has a documented Hermes V1 memory regression affecting apps importing Reanimated/Worklets.

Teswa uses both, so SDK 56 is a migration checkpoint only, not a release target.

SDK 57 with `expo@57.0.17+` moves to React Native 0.86.3 and resolves that regression.

References:
https://expo.dev/changelog/sdk-56
https://expo.dev/changelog/sdk-57

## Gates

No EAS build at the SDK 56 checkpoint.

Each package checkpoint must pass:
- dependency install / lockfile integrity
- Expo Doctor
- TypeScript
- Expo prebuild Android
- generated native config inspection

First device build occurs after the SDK 57 + native dependency alignment is complete unless a blocker requires earlier isolation.
