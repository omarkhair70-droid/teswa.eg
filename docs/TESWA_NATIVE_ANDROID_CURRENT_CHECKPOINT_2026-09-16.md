# Teswa Native Android — Current Checkpoint — 2026-09-16

> **Read this first.** Use `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md` for broader history and `TESWA_NATIVE_ANDROID_MASTER.md` for invariants. Always re-check PR #523 head before writing.

## Repository state

- Repository: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — `Build Teswa native Android Oracle client`
- Latest verified green implementation checkpoint before this documentation commit: `ba2fd82b18a16ec8bf9f70bd779129447d99fc3b`
- PR remains **open, mergeable, not merged**.
- Do **not** merge #523 unless Omar explicitly asks.

## Native product status

The native Kotlin/Compose client is feature-complete for the planned rewrite scope. Closed slices include:

- centralized Oracle auth/transport/session restore/serialized refresh + exactly one retry after 401;
- Arabic-first authenticated shell and five permanent bottom destinations: Home, Discover, Add, Messages, Profile;
- Notifications preserved as an internal route from Home/push/deep links rather than a sixth bottom tab;
- Home, Item Detail, Nearby/location, Add Item;
- Offers, Deals, Reviews/Trust;
- Direct and Contextual Messaging with shared Voice primitives;
- Stories;
- Profile/Public Profile, Follow/Block, reusable Followers/Following;
- Settings;
- Notifications/FCM foundation;
- Discover 2.0, People, Motion / City Pulse;
- Dolab Native 2.0 critical path including media/voice, Dolab -> Add Item and Direct bridge;
- Full Edit Listing Native preserving the same item and ordered image plan;
- Native Trust & Safety / Reporting for user, item, story, direct message, deal and deal message;
- final navigation/state cleanup pass completed before release hardening.

Key closed checkpoints remain documented in the older handoff and PR history. No product feature slice should be reopened without a concrete device or production failure.

## Static / release hardening — CLOSED GREEN

Release hardening is now complete at `ba2fd82b18a16ec8bf9f70bd779129447d99fc3b`.

### CI gate

`.github/workflows/android-native-foundation.yml` now runs:

- native JVM/unit tests;
- `compileDebugKotlin`;
- `compileReleaseKotlin`;
- `lintRelease`.

Verified at `ba2fd82...`:

- Canonical Stabilization Validation #51: **success**;
- Android Native Foundation #79: **success**;
- native unit tests: **success**;
- debug Kotlin compile: **success**;
- release Kotlin compile: **success**;
- Android release lint: **success**.

### Release branding

Native Android now uses Teswa's existing repository branding assets rather than generic launcher defaults:

- launcher icon;
- adaptive/round icon;
- monochrome icon;
- light/dark launch theme;
- Android 12+ splash treatment.

The API-level lint issue around `windowLightNavigationBar` was fixed correctly with API-qualified `values-v27` / `values-night-v27` resources rather than suppression or a lint baseline.

### Release identity

Release identity is unchanged:

- `applicationId com.teswa.mobile`;
- `versionCode 26`;
- `versionName 1.0.11`;
- existing Google Play signing/upload identity must be reused.

### Secure signing path

`android-native/app/build.gradle.kts` supports production release signing only when all four environment variables exist:

- `TESWA_RELEASE_STORE_FILE`;
- `TESWA_RELEASE_STORE_PASSWORD`;
- `TESWA_RELEASE_KEY_ALIAS`;
- `TESWA_RELEASE_KEY_PASSWORD`.

The repository does not store a production keystore or passwords. Root `.gitignore` explicitly excludes Android signing material including `*.keystore`, `*.jks`, `*.p12`, `*.pfx`, `keystore.properties`, and `signing.properties`.

`android-native/RELEASE_SIGNING.md` documents certificate verification and the signed v26 AAB command. `assembleRelease` / `bundleRelease` intentionally refuse to create a release artifact when the signing environment is incomplete.

Historical local evidence shows an older Teswa Android folder contained `android.keystore` and signed release artifacts, but the key file itself is not stored in this repository. Before a production AAB is built, its certificate must be matched to the Google Play Console **Upload key certificate**. Do not generate a replacement production key casually.

## ACTIVE RELEASE GATE

There is no remaining large code/product slice. The active work is empirical release acceptance.

### 1. Physical-device critical-flow smoke

On a real Android device validate:

- cold launch and existing-session restore;
- email/Google auth paths used for release;
- Home/Discover/Add/Messages/Profile navigation;
- Item Detail and profile navigation;
- camera + gallery + media upload;
- location/Nearby permission and result path;
- Direct/contextual messages and voice record/playback;
- Stories capture/view/upload path;
- Dolab critical path including save/media/voice and bridges;
- Edit Listing including image reorder/remove/cover and same-item persistence;
- Reporting entry points and success state;
- Followers/Following navigation;
- notification permission, FCM token sync, background notification open and deep-link routing.

A JVM/compile/lint green run is not physical-device acceptance.

### 2. Signed v26 AAB

Use the existing Play upload identity only after fingerprint verification. Build from `android-native` with the signing environment documented in `RELEASE_SIGNING.md`.

Expected artifact when the local signed build is intentionally run:

`android-native/app/build/outputs/bundle/release/app-release.aab`

### 3. Play Internal update-over-installed-app

Upload the signed v26 AAB to Google Play Internal testing and validate it updates the currently installed Play build for package `com.teswa.mobile` without uninstall/data reset.

This is the authoritative update proof. A locally sideloaded APK signed with an upload key is not a substitute when Play App Signing is enabled.

### 4. Oracle production acceptance

Run end-to-end critical flows against the intended production Oracle runtime and collect evidence for:

- auth/session durability;
- reads/writes for marketplace/profile/social flows;
- media upload/object access;
- messaging/voice/stories;
- notifications/deep links where applicable;
- rollback path.

Only after this gate passes should production authority/cutover be declared complete.

### 5. Legacy cleanup — LAST

Only after physical-device, Play Internal update, and Oracle production acceptance:

- merge/cut over intentionally;
- keep rollback evidence;
- open a separate cleanup PR removing legacy Expo/React Native/Supabase mobile runtime.

Do not delete the legacy runtime before acceptance.

## Non-negotiable architecture reminder

- Expo is behavioral reference only.
- Oracle contracts own data/business truth.
- Native Android owns the UX implementation.
- No Supabase/Expo runtime dependency in `android-native`.
- No network calls in Composables.
- Reuse real repeated primitives; avoid duplicate media/voice/network stacks.
- `applicationId com.teswa.mobile`, `versionCode 26`, and the existing Play signing identity remain unchanged through this release gate.
- Do not claim device, Play-update, push-delivery, or production acceptance from CI alone.
