# Native Android release signing

Teswa release signing must reuse the upload key already accepted by Google Play. Do not generate a new production key as part of the native rewrite.

The repository never stores the keystore or signing passwords. `android-native/app/build.gradle.kts` reads release signing only from these environment variables:

- `TESWA_RELEASE_STORE_FILE`
- `TESWA_RELEASE_STORE_PASSWORD`
- `TESWA_RELEASE_KEY_ALIAS`
- `TESWA_RELEASE_KEY_PASSWORD`

If all four are present, the `release` build type uses that signing config. If they are absent, normal unit tests, debug compilation, release compilation and lint still work, but `assembleRelease` / `bundleRelease` intentionally refuse to create a release artifact.

## Verify the key before building

Inspect the existing keystore certificate locally; let `keytool` prompt for the password instead of placing it in shell history:

```powershell
keytool -list -v -keystore $env:TESWA_RELEASE_STORE_FILE
```

Compare the certificate fingerprint with **Google Play Console -> App integrity -> Upload key certificate**. The Play app-signing certificate and upload-key certificate can be different; the upload-key certificate is the relevant identity for an AAB upload.

## Build a signed v26 AAB locally

From the `android-native` directory in PowerShell:

```powershell
$env:TESWA_RELEASE_STORE_FILE = '<path-to-existing-keystore>'
$env:TESWA_RELEASE_STORE_PASSWORD = '<local-secret>'
$env:TESWA_RELEASE_KEY_ALIAS = '<existing-alias>'
$env:TESWA_RELEASE_KEY_PASSWORD = '<local-secret>'
.\gradlew.bat :app:bundleRelease
```

Expected output:

`app\build\outputs\bundle\release\app-release.aab`

The native application id remains `com.teswa.mobile` and versionCode remains `26`.

## Update-over-installed-app acceptance

Use the signed AAB through Google Play Internal testing for the real update test. If Play App Signing is enabled, a locally signed APK uses the upload key while the APK installed from Play is signed with the Play app-signing key, so sideloading that local APK is not a valid update-over-Play proof.

Do not remove the legacy Expo/Supabase mobile runtime until the Play Internal update and Oracle production acceptance gates are both complete.
