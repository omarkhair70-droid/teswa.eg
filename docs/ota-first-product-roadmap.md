# Teswa OTA-first product roadmap

## Context

The Android production build based on PR #393 is now the active baseline.

This baseline includes the native/runtime foundation needed for several months of OTA-first work:

- Expo SDK 55 production build.
- Sentry crash monitoring foundation.
- Real-user performance telemetry.
- Stream Direct Chat foundation.
- Direct Chat instant message cache.
- Direct Chat media attachments, video thumbnail cards, image viewer polish, toast feedback, and action labels.
- Settings foundation with appearance/language/notifications/privacy/account/about sections.
- Restyle theme foundation.
- Lucide icon wrapper.
- Toast foundation.
- React Hook Form/Zod form foundation.
- Expo Localization/i18n foundation.
- EAS build and submit npm scripts.

The guiding rule for the next phase is:

> Prefer OTA-safe JavaScript, TypeScript, UI, UX, and logic improvements. Avoid new native dependencies until a clear build-needed batch is worth it.

## Release strategy

### OTA-first by default

Use OTA updates for:

- UI polish.
- Settings improvements.
- Direct Chat behavior/UI improvements.
- Copy/text changes.
- Cache logic improvements.
- Telemetry additions that do not require new native code.
- Notification permission UX if it uses existing `expo-notifications` only.
- Media control reliability if it uses existing `expo-video` and `expo-audio` only.

### Build-needed only when necessary

A new native build is required for:

- New native packages.
- Expo SDK upgrades.
- app config plugin changes.
- Android permission changes.
- Google/Firebase native config changes.
- runtimeVersion/appVersion changes that should break OTA compatibility.
- Sentry/native monitoring configuration changes beyond JS-safe setup.

Before every PR, classify it as:

- `OTA-safe`
- `Build-needed`
- `Needs review`

## Phase 0F.2 — Runtime Notification Permission + Reliable Media Controls

### Goal

Make notifications and media controls feel reliable without adding packages or requiring a build.

### Scope

- Use existing `expo-notifications`.
- Use existing `expo-audio` and `expo-video`.
- No package changes.
- No app config changes.
- No Supabase migration unless unavoidable.

### Tasks

1. Add explicit notification permission UX in Settings.
2. Show current notification permission/token state.
3. Add an enable notifications action triggered only by the user.
4. Add a silent push sync helper that never opens the OS permission prompt.
5. Ensure background/session sync never calls `requestPermissionsAsync`.
6. If permission is denied permanently, show Arabic guidance to open system settings.
7. Add voice playback busy guard.
8. Stop voice playback when leaving Direct Chat or changing conversations.
9. Prevent overlapping voice playback.
10. Keep video/file/image viewer behavior stable.
11. Add docs and manual QA checklist.

### Acceptance criteria

- User can explicitly enable notifications from Settings.
- No surprise notification permission prompt appears on app startup/session sync.
- Direct Chat voice playback cannot overlap badly.
- Leaving chat stops voice playback.
- Typecheck, diff check, and expo-doctor pass.
- OTA-safe.

## Phase 0G — Settings becomes useful, not just foundational

### Goal

Turn Settings into a real control center while staying OTA-safe.

### Tasks

1. Notifications page polish:
   - permission state
   - enable/disabled state
   - quiet mode placeholder if not fully implemented
   - link to notification center
2. Privacy and safety polish:
   - direct privacy clearer copy
   - report center link for admins remains conditional
   - block/report guidance
3. Account polish:
   - profile edit link
   - deletion flow link clarity
   - app version/build display if available from constants
4. About section:
   - version
   - build/runtime channel
   - support/contact route if available
5. Language preference copy:
   - keep English disabled until translations are real
   - explain restart/RTL behavior clearly
6. Appearance:
   - keep system/light/dark preference stored
   - do not force full dark theme until screens are audited

### Acceptance criteria

- Settings feels intentional and understandable.
- No broken routes.
- No fake enabled feature.
- OTA-safe.

## Phase 0H — Direct Chat reliability and polish

### Goal

Make Direct Chat feel dependable under normal user behavior.

### Tasks

1. Message action sheet cleanup:
   - clearer grouping
   - destructive actions visually separated if supported by current sheet
   - no duplicate feedback
2. Reactions V1.1:
   - own reaction highlighting if available from current mapped message state
   - prevent repeated spam taps while reaction is in-flight
   - keep heart/thumbs only for now
3. Typing indicator polish:
   - avoid stale typing text
   - calmer copy
   - no layout jump
4. Reply preview polish:
   - clearer reply target card
   - cancel affordance
   - fallback if quoted message is missing
5. Stream error recovery:
   - retry button stays clear
   - cached messages stay visible when live connection fails
   - no legacy fallback for accepted Stream chat
6. Dolab save/share polish:
   - clearer empty Dolab state
   - better feedback when media is unsupported

### Acceptance criteria

- Direct Chat remains stable with text/media/voice.
- Cached/live behavior remains correct.
- No changes to send/upload payloads unless explicitly reviewed.
- OTA-safe.

## Phase 0I — Home, item detail, and perceived speed

### Goal

Use the current telemetry/cache foundation to improve perceived speed without guessing.

### Tasks

1. Review `performance_metric` rows in Supabase.
2. Identify slow p75/p95 screens:
   - app start to first screen
   - auth ready time
   - home first content
   - item detail first content
   - direct chat first message
3. Home feed polish:
   - better skeleton/empty state
   - explicit stale-cache copy only if helpful
   - avoid unnecessary refetch flicker
4. Item detail polish:
   - image/media placeholder consistency
   - error retry state
   - stable layout while loading
5. Add only safe metadata to telemetry.

### Acceptance criteria

- Improvements are driven by real metrics.
- No private content is logged.
- OTA-safe.

## Phase 0J — Form and validation adoption

### Goal

Use the already-installed form foundation where it matters first.

### Candidate screens

- Login/signup fields if currently fragile.
- Profile edit.
- Item creation/editing.
- Report forms.
- Direct privacy settings.

### Tasks

1. Pick one form per PR.
2. Add Zod schema.
3. Use React Hook Form only where it simplifies code.
4. Improve Arabic validation messages.
5. Keep submission behavior unchanged unless explicitly reviewed.

### Acceptance criteria

- Less validation drift.
- Better Arabic errors.
- No large rewrites.
- OTA-safe.

## Phase 0K — Visual system adoption

### Goal

Gradually apply the UI foundation without redesigning the whole app at once.

### Tasks

1. Standardize icons through `AppIcon` where low risk.
2. Standardize toasts through `showToast` helper.
3. Use theme tokens for new/edited screens.
4. Improve bottom tabs labels/icons if current implementation allows JS-only changes.
5. Add version/build info in Settings/About.
6. Keep old screens visually stable until touched.

### Acceptance criteria

- UI becomes more consistent.
- No large visual regressions.
- OTA-safe.

## Phase 0L — Notifications V1

### Goal

After permission UX is reliable, make notifications feel useful.

### Tasks

1. Verify push token registration in Supabase.
2. Verify notification routes:
   - `/notifications`
   - `/direct/:id`
   - `/item/:id`
   - `/profile/:id`
3. Add notification center polish.
4. Add read/unread UX if existing backend supports it.
5. Add notification preferences only if backend support already exists or can be JS-safe.

### Acceptance criteria

- Tapping notifications routes correctly.
- Permission state is understandable.
- No unexpected prompts.
- Mostly OTA-safe unless backend/native requirements appear.

## Phase 0M — Build-needed backlog

Do not do these immediately unless grouped into a future native build batch:

- New native image viewer/pinch zoom package.
- New native context menu package.
- Any extra notification native capability requiring config changes.
- Expo SDK upgrade.
- New Firebase/Google native setup.
- Android permission additions.

When this backlog becomes valuable enough, create a single build-needed phase instead of scattered builds.

## Ongoing QA checklist for every OTA

Before publishing OTA:

```powershell
npm run typecheck
git diff --check
npx expo-doctor
```

Manual smoke:

- Launch app.
- Auth/session loads.
- Home opens.
- Item detail opens.
- Profile opens.
- Settings opens.
- Direct Chat opens.
- Text send still works.
- Image/video/file viewer paths still work if touched.
- No obvious crash in Sentry after rollout.

Publish OTA only after merge to `main` and smoke confidence.

## OTA command

Use a clear message:

```powershell
eas update --channel production --message "Short useful update message"
```

If EAS asks for branch/channel confirmation, keep it aligned with the production channel currently used by the production build.

## Working style

- One focused PR at a time.
- Prefer docs with each stabilization phase.
- Avoid adding packages unless a build-needed batch is approved.
- If a PR touches Direct Chat send/upload/Stream connection logic, review it as high risk.
- If a PR changes only UI/copy/state handling, treat it as OTA candidate.
