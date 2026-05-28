# Sentry crash monitoring setup

Teswa uses `@sentry/react-native` as a crash and runtime error monitoring foundation for Expo development builds and production builds. This setup is intentionally limited to developer-grade error visibility; Supabase remains the source for performance telemetry.

## What Sentry captures

When `EXPO_PUBLIC_SENTRY_DSN` is set, Sentry can capture:

- Unhandled JavaScript exceptions and React Native runtime errors.
- Native crashes reported by the Sentry React Native SDK in production-capable builds.
- Handled exceptions sent through `captureHandledError(error, context)`.
- Non-PII technical context such as stack traces, release/build metadata, device/runtime information, breadcrumbs, and the authenticated Supabase user id only.

The Sentry user context must only contain `{ id: userId }`. Do not add email, phone number, display name, addresses, item descriptions, chat/message bodies, or other user-generated text.

## What is intentionally disabled

The Teswa Sentry foundation intentionally does **not** enable:

- Session Replay.
- Sentry Logs.
- Sentry performance tracing as a primary telemetry source (`tracesSampleRate` is `0`).
- Default PII collection (`sendDefaultPii: false`).
- Hardcoded Sentry auth tokens or real DSN values in the repository.

A `beforeSend` sanitizer also filters sensitive keys and common sensitive string patterns before events leave the app, including message bodies, item descriptions, emails, phone numbers, tokens, passwords, secrets, image URLs, exact GPS coordinates, and user-generated text.

## Required environment variables

Local `.env` / EAS environment values should use these names:

```sh
EXPO_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- `EXPO_PUBLIC_SENTRY_DSN` is the client DSN used by the app. Leave it unset to disable Sentry safely.
- `SENTRY_ORG` and `SENTRY_PROJECT` are used by the Expo config plugin for source map/release integration.
- `SENTRY_AUTH_TOKEN` is a build secret for source map uploads. Never commit a real token.

## Configure EAS secrets

Set production/preview values through EAS rather than committing them:

```sh
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
eas env:create --scope project --environment production --name EXPO_PUBLIC_SENTRY_DSN --value <dsn>
eas env:create --scope project --environment production --name SENTRY_ORG --value <org-slug>
eas env:create --scope project --environment production --name SENTRY_PROJECT --value <project-slug>
```

Repeat for preview/development EAS environments if they use separate Sentry projects.

## Verify in a development build

Expo Go may not represent the full production Sentry setup because native crash capture, config-plugin changes, and source map upload behavior require a development build or release build.

Recommended verification flow:

1. Build and install a development build with `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` set.
2. Start the app and confirm normal boot.
3. Temporarily call `captureHandledError(new Error('Sentry dev verification'), { source: 'manual_dev_check' })` from a local-only development path.
4. Confirm the event arrives in the expected Sentry project.
5. Remove the temporary verification call before committing. Do not add a user-facing crash button to production.
6. Repeat one boot with `EXPO_PUBLIC_SENTRY_DSN` unset to confirm Sentry stays disabled and the app still starts.
