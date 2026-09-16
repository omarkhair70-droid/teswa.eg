# Native Android release gate

Teswa release artifacts must reuse the upload key already accepted by Google Play and must target an explicitly accepted Oracle release endpoint. Do not generate a new production key or silently ship the rehearsal endpoint as part of the native rewrite.

## Google Play upload-key identity

Google Play Console currently registers this Teswa **Upload key certificate SHA-256**:

`9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1`

This is a public certificate fingerprint, not a signing secret. `scripts/release-gate.ps1` pins this value and refuses to build a release AAB if the configured local keystore certificate does not match it. Update the pinned fingerprint only after an intentional Google Play upload-key reset.

## Required local environment

The repository never stores signing material or production credentials. A signed release build uses:

- `TESWA_RELEASE_STORE_FILE`
- `TESWA_RELEASE_STORE_PASSWORD`
- `TESWA_RELEASE_KEY_ALIAS`
- `TESWA_RELEASE_KEY_PASSWORD`
- `TESWA_RELEASE_API_BASE_URL`

Normal unit tests, debug compilation, release compilation and lint can run without these values. `assembleRelease` / `bundleRelease` intentionally refuse to create a release artifact unless signing inputs and an explicit HTTPS release API URL are present.

The repository fallback API (`https://130-110-122-142.sslip.io`) is retained only so compile/test paths have a concrete configured endpoint. It originated as the public Oracle HTTPS rehearsal surface and must not be treated as production merely because release code compiles against it.

## Preferred signed-AAB command

From the repository root, after setting the required environment variables, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\release-gate.ps1
```

The helper:

1. refuses missing signing/API inputs;
2. confirms the keystore file exists;
3. requires an absolute HTTPS release API URL;
4. reads the existing keystore certificate with `keytool` without printing the store password;
5. compares its SHA-256 fingerprint to the Play-pinned Teswa upload certificate above;
6. builds `:app:bundleRelease` only after that match;
7. verifies the resulting AAB signature with `jarsigner`;
8. prints the final AAB SHA-256 file hash for release evidence.

Expected artifact:

`android-native\app\build\outputs\bundle\release\app-release.aab`

Release identity remains:

- package: `com.teswa.mobile`
- versionCode: `26`
- versionName: `1.0.11`

## Manual certificate inspection

If certificate inspection is needed independently, use `keytool` and let the JDK read the password from the environment rather than placing it directly in command arguments:

```powershell
keytool -list -v -keystore $env:TESWA_RELEASE_STORE_FILE -alias $env:TESWA_RELEASE_KEY_ALIAS -storepass:env TESWA_RELEASE_STORE_PASSWORD
```

The SHA-256 line must equal the pinned Google Play **Upload key certificate** above. The Play app-signing certificate and the upload-key certificate can be different; the upload-key certificate is the relevant identity for accepting an AAB upload.

## Real update acceptance

Upload the verified signed AAB to Google Play Internal testing, then update the existing `com.teswa.mobile` installation without uninstalling or clearing data. That is the authoritative update-over-installed-app proof.

If Play App Signing is enabled, a locally signed APK normally carries the upload key while the Play-installed APK carries the Play app-signing key. Sideloading the local APK is therefore not a valid replacement for the Play Internal update test.

After the Internal update, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\device-smoke.ps1
```

The device helper does not install or replace the app. It checks the installed package/version, cold launch, the real `teswa://notifications` route, and captures evidence before printing the remaining manual critical-flow checklist.

Do not remove the legacy Expo/Supabase mobile runtime until the physical-device, Play Internal update, and Oracle production acceptance gates are complete.
