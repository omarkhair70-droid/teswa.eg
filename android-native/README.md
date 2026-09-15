# Teswa Android Native

This directory is the replacement Android client for Teswa. It is intentionally developed beside the Expo client until native parity is proven.

## Identity

- package / applicationId: `com.teswa.mobile`
- first native Internal-testing versionCode: `26`
- first native versionName: `1.0.11`

Keeping the same applicationId and Play signing identity allows the native client to ship as an update to the existing Teswa listing rather than as a second app.

## Toolchain

- Kotlin `2.3.21`
- Android Gradle Plugin `9.4.0`
- Gradle `9.6.0` in CI
- Jetpack Compose BOM `2026.08.00`
- JDK 17

## Migration rule

Do not port implementation accidents from Expo. Reuse the Oracle HTTP contracts and user-facing product behavior, then implement Android-native storage, lifecycle, media and background behavior directly.

## Order

1. project/build foundation
2. Credential Manager Google sign-in + Oracle session exchange
3. durable session storage and account/profile/policy gate
4. Home and read-only marketplace
5. item details/media
6. create/edit listing
7. offers/deals/messages
8. stories/notifications/background work
9. camera/audio/video/share-intent parity
10. Internal-testing AAB and real-device closure

The Expo app remains a reference implementation until these gates pass; it is not the long-term Android runtime.
