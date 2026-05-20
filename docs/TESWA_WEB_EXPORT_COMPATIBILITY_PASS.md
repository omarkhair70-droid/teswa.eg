# Teswa Web Export Compatibility Pass

## Why Vercel web export failed

The Vercel build uses Expo static web export (`npm run export:web`). The deployment was blocked by native-only modules being pulled into the web bundle.

### Already solved before this pass

- `lottie-react-native` on web required `@lottiefiles/dotlottie-react`.
- This dependency had already been added before this pass, allowing the build to proceed further.

## Blocker fixed in this pass: PagerView on web

### Failure

- Expo web export failed with:
  - `Importing native-only module "react-native/Libraries/Utilities/codegenNativeCommands" on web`
- Import chain included:
  - `react-native-pager-view`
  - `app/story/[userId].tsx`

### Fix

Implemented a platform-aware Story pager abstraction so web no longer imports `react-native-pager-view`:

- `components/story/StoryPager.tsx` (native/default): uses `react-native-pager-view` and preserves native swipe/page behavior.
- `components/story/StoryPager.web.tsx`: web-safe fallback that renders the active story page without native pager dependency.
- `app/story/[userId].tsx`: now imports `StoryPager` instead of importing `react-native-pager-view` directly.

### Behavior impact

- **Android/iOS**: Story viewer pager behavior preserved via native PagerView implementation.
- **Web**: Story viewing remains stable and renderable with a simplified pager fallback (no native pager module).

## Additional native-only audit and compatibility hardening

### Share intent in root layout

`app/_layout.tsx` originally imported `expo-share-intent` directly. To prevent potential web bundling/runtime issues:

- Added `lib/share-intent-compat.tsx` (native/default): re-exports from `expo-share-intent`.
- Added `lib/share-intent-compat.web.tsx` (web): provides a no-op provider and no-op context hook values.
- Updated `app/_layout.tsx` to import share-intent API from `@/lib/share-intent-compat`.

This keeps inbound share intent behavior intact on mobile while making web route rendering stable.

## Intentional web fallbacks

- Story pager on web is simplified through `StoryPager.web.tsx`.
- Share intent provider/context on web is a no-op compatibility layer.

These fallbacks preserve page stability and allow web export compatibility without removing mobile features.

## Compliance routes

The pass keeps existing compliance routes intact:

- `/legal/privacy`
- `/account-deletion`

## Validation status in this environment

Commands requested:

- `git diff --check`
- `npm run typecheck`
- `npm run export:web`

Observed environment limitations:

- `npm run export:web` failed because Expo CLI is not available in this environment (`expo: not found`).
- `npm run typecheck` failed because project dependencies / Expo TypeScript base config are not installed/resolvable in this environment (`tsconfig` cannot resolve `expo/tsconfig.base`, plus many missing module/type errors).

So final end-to-end export success cannot be asserted from this environment alone.

## Vercel deployment settings

- **Framework Preset:** `Other`
- **Build Command:** `npm run export:web`
- **Output Directory:** `dist`
