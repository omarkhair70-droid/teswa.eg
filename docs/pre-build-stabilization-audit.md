# Pre-build stabilization audit

## Decision

Teswa is ready to move into a focused Android build verification pass, not another feature phase.

Recent stabilization work on `main` includes:

- Sentry crash monitoring foundation.
- Real-user performance telemetry.
- UI/settings foundation.
- Direct Chat Stream capability audit.
- Direct Chat instant-open message cache.
- Direct Chat video thumbnail cards.
- Direct Chat toast feedback.
- Direct Chat image viewer polish.
- Direct Chat action/reaction label polish.

## Build target

Primary target for this audit is Android production build.

The current EAS production profile uses:

- `autoIncrement: true`
- `channel: production`
- `environment: production`

The current submit profile targets Android internal track.

## Required local checks before build

Run these from a clean `main` checkout:

```powershell
git checkout main
git pull origin main
npm install
npm run typecheck
git diff --check
npx expo-doctor
```

Expected result:

- typecheck passes.
- diff check has no whitespace errors.
- expo-doctor reports 19/19 checks passed.
- working tree has no tracked code changes.

`viewer-modal.txt` may exist locally from manual editing. It must stay untracked and must not be committed.

## Required environment variables

Production EAS environment should contain:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_SHARE_BASE_URL`
- `EXPO_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` as a build secret only

Do not commit real secrets to the repo.

## Required Android assets/files

Before production build, confirm the local/EAS environment has:

- `google-services.json` for production Android package `com.teswa.mobile`.
- branding assets referenced by app config:
  - `assets/branding/icon.png`
  - `assets/branding/adaptive-icon-foreground.png`
  - `assets/branding/monochrome-icon.png`
  - `assets/branding/splash-mark.png`

## Config review notes

Current config intentionally uses:

- `userInterfaceStyle: automatic`
- Android package `com.teswa.mobile` for production
- Android package `com.teswa.mobile.preview` for preview
- Sentry Expo plugin with org/project sourced from environment variables
- Sentry Metro config
- OTA updates with `runtimeVersion.policy = appVersion`

Before build, verify the remote EAS app version/build number state is correct because `eas.json` uses remote app version source and production auto-increment.

## Manual QA on build

After the Android build installs, run this smoke test:

### App shell

- App launches successfully.
- Splash screen displays correctly.
- Auth session loads correctly.
- Login/signup still work if signed out.
- Profile tab opens.
- Settings shortcut opens.
- Appearance setting does not crash.
- Android system dark mode does not break core screens.

### Home/item flows

- Home feed loads.
- Pull/background refresh works.
- Item detail opens.
- Images/media still render.
- Share/open external routes still work where applicable.

### Direct Chat

- Accepted Direct Chat opens.
- Cached messages appear immediately when available.
- Live Stream hydration updates messages.
- Requested/non-accepted chat behavior remains unchanged.
- Copy text shows toast.
- Reply action works.
- Heart/thumbs reactions send or fail gracefully with toast.
- Own-message report is disabled.
- Own-message delete is available only for own messages.
- Image viewer opens and closes.
- Image viewer copy/open externally actions work.
- Video thumbnail cards render or fallback gracefully.
- Video viewer/file viewer still work.
- Media picker/send errors show toast.
- Voice recording/send/playback feedback does not crash.
- Save to Dolab still works or fails gracefully.

### Safety/moderation

- Report user route opens.
- Report message route/RPC path behaves correctly.
- Block/unblock feedback works.
- No sensitive message content is sent through telemetry or Sentry.

## Build commands

Production Android build:

```powershell
npm run build:android
```

This script runs:

```powershell
eas build --platform android --profile production
```

Optional submit to internal track after manual smoke test:

```powershell
npm run submit:android
```

This script runs:

```powershell
eas submit --platform android --profile production
```

## Known non-blockers

- Some polish work remains intentionally postponed: richer reaction picker, native context menu, link previews, and pinch/zoom gallery viewer.
- These are not required for this build pass.

## Do not add before build

Avoid adding new packages or large chat rewrites before this build. Any issue found in QA should be fixed as a small targeted stabilization PR.
