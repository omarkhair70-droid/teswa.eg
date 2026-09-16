# Teswa Native Android — Current Checkpoint — 2026-09-16

> **Read this first.** Use `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md` for broader history and `TESWA_NATIVE_ANDROID_MASTER.md` for architecture/release invariants. Always re-check PR #523 head before writing.

## Repository state

- Repository: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — `Build Teswa native Android Oracle client`
- Latest verified green implementation checkpoint before this documentation commit: `3cf3062ccfc4542125312ab5322071c40ce09bc4`
- PR remains **open, mergeable, not merged**.
- Do **not** merge #523 unless Omar explicitly asks.

## Native product status

The planned Kotlin/Compose rewrite scope is feature-complete. Closed slices include centralized Oracle auth/session/transport; the five-tab Arabic-first shell; Home, Discover, Add Item, Item Detail, Nearby; Offers, Deals, Reviews; Direct/Contextual Messaging and shared Voice; Stories; Profile/Public Profile, Follow/Block, Followers/Following; Settings; Notifications/FCM foundation; People; Motion/City Pulse; Dolab Native 2.0; Edit Listing; Trust & Safety / Reporting; and the final navigation/state cleanup pass.

Do not reopen a product slice without a concrete device or production failure.

## Static / release hardening — CLOSED GREEN

Latest verified implementation: `3cf3062ccfc4542125312ab5322071c40ce09bc4`.

Verified:

- Canonical Stabilization Validation #54: **success**;
- Android Native Foundation #82: **success**;
- native unit tests: **success**;
- `compileDebugKotlin`: **success**;
- `compileReleaseKotlin`: **success**;
- `lintRelease`: **success**.

Release hardening includes:

- Teswa launcher/adaptive/round/monochrome branding;
- light/dark launch theme and Android 12+ splash resources;
- API-qualified theme resources instead of lint suppression;
- keystore/signing material excluded from Git;
- release signing via environment variables only;
- release-variant compilation and lint in CI;
- explicit release API endpoint guard;
- upload-key fingerprint verification helper;
- physical-device evidence helper.

Release identity remains unchanged:

- `applicationId com.teswa.mobile`;
- `versionCode 26`;
- `versionName 1.0.11`;
- existing Google Play upload/signing identity must be reused.

## Release endpoint guard

The repository fallback endpoint is:

`https://130-110-122-142.sslip.io`

Historical migration evidence identifies that host as the public Oracle HTTPS **rehearsal** surface. It must not be treated as production merely because native compile/tests use it.

`android-native/app/build.gradle.kts` therefore allows that URL as a compile/test fallback only. `assembleRelease` / `bundleRelease` now refuse to produce a distributable release artifact unless an explicit valid HTTPS `TESWA_RELEASE_API_BASE_URL` is supplied.

Production Oracle authority/cutover is still an acceptance gate. Supabase/legacy remains rollback authority until that acceptance is explicit.

## Secure signed-AAB gate

Required signing environment:

- `TESWA_RELEASE_STORE_FILE`;
- `TESWA_RELEASE_STORE_PASSWORD`;
- `TESWA_RELEASE_KEY_ALIAS`;
- `TESWA_RELEASE_KEY_PASSWORD`;
- `TESWA_RELEASE_API_BASE_URL`.

The preferred helper also requires:

- `TESWA_PLAY_UPLOAD_SHA256` — copied from Google Play Console -> App integrity -> **Upload key certificate**.

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\release-gate.ps1
```

The helper refuses missing inputs, validates the HTTPS release API URL, reads the existing keystore certificate without printing the store password, compares its SHA-256 fingerprint to the Play upload certificate, builds `:app:bundleRelease`, verifies the AAB signature with `jarsigner`, and prints the final AAB SHA-256 file hash.

Expected artifact:

`android-native\app\build\outputs\bundle\release\app-release.aab`

Historical local evidence showed an older Teswa Android folder contained `android.keystore` and signed release artifacts, but that folder was not authoritative for the current `com.teswa.mobile` identity.

**Upload-key identity is now empirically verified.** On 2026-09-16, the Android credentials for the EAS `production` profile of project `teswa-mobile` / application identifier `com.teswa.mobile` were downloaded locally from EAS. The downloaded JKS certificate SHA-256 was read with `keytool` and matched the Google Play Console **Upload key certificate** exactly:

`9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1`

No keystore password, key password, JKS bytes, or other signing secret is stored in Git. Do not generate a replacement key or migrate/convert the verified JKS as part of this release gate.

## Physical-device evidence helper

After the native v26 build has been installed/updated through Google Play Internal testing, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\device-smoke.ps1
```

The helper does **not** install or replace the application. It:

- resolves one authorized adb device (or accepts `-Serial`);
- reads model/API/package/version evidence;
- checks `com.teswa.mobile` and expected versionCode 26;
- performs a cold launch;
- exercises the real parser-supported `teswa://notifications` deep link;
- captures package dump, activity state, launch output and logcat under `android-native/build/device-smoke/<timestamp>/`;
- prints/saves the remaining manual critical-flow checklist.

It deliberately does not mark camera/media/location/voice/push/Oracle flows accepted automatically.

## ACTIVE RELEASE GATE

There is no remaining large Git-side product slice. Remaining acceptance is empirical:

### 1. Confirm production Oracle release endpoint

Identify and accept the Oracle endpoint that is actually intended for native production traffic. Use that exact HTTPS URL as `TESWA_RELEASE_API_BASE_URL`. Do not silently reuse the rehearsal host.

### 2. Build signed v26 AAB with the verified Play upload key

The existing Play upload-key certificate match is **closed/verified**. After the production Oracle release endpoint is accepted, point the release environment at the downloaded EAS production JKS and run `scripts/release-gate.ps1` to produce and verify the signed v26 AAB.

### 3. Google Play Internal update-over-installed-app

Upload the signed v26 AAB to Internal testing and update the existing Play-installed `com.teswa.mobile` without uninstalling or clearing app data.

This is the authoritative update proof. A locally sideloaded upload-key APK is not a substitute when Play App Signing is enabled.

### 4. Physical-device critical-flow smoke

Validate on the updated real device:

- cold launch and existing-session restore;
- email/Google auth path used for release;
- Home / Discover / Add / Messages / Profile;
- Item Detail and Public Profile navigation;
- camera + gallery + media upload;
- location/Nearby;
- Direct/contextual messages + voice;
- Stories;
- Dolab critical path + bridges;
- Edit Listing same-item persistence and image plan;
- Reporting;
- Followers/Following;
- notification permission + FCM token sync;
- background/killed-process notification delivery + tap/deep-link route.

### 5. Oracle production acceptance + rollback evidence

Run the critical reads/writes/media/messaging/notification paths against the intended production Oracle runtime. Only after this passes should Oracle cutover be declared complete.

### 6. Legacy cleanup — LAST

Only after physical-device, Play Internal update, and Oracle production acceptance:

- perform the intentional merge/cutover;
- retain rollback evidence;
- open a separate cleanup PR removing legacy Expo/React Native/Supabase mobile runtime.

## Non-negotiable reminder

- Expo is behavioral reference only.
- Oracle contracts own data/business truth.
- Native Android owns UX implementation.
- No Supabase/Expo runtime dependency in `android-native`.
- No networking inside Composables.
- Reuse shared media/voice/network primitives.
- Keep `com.teswa.mobile`, versionCode 26, and the existing Play identity unchanged through this gate.
- Do not claim physical-device, Play-update, push-delivery, signed-AAB, or Oracle production acceptance from CI alone.
