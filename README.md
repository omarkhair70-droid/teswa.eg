# Teswa Mobile (تِسوى)

Teswa is an Arabic-first mobile swap marketplace evolving into a living social exchange world where items, stories, people, and local activity create value beyond traditional buying/selling.

Core lines:
- "حاجتك لسه لها قيمة."
- "قبل ما تسيبها، شوف تِسوى إيه."

## Current Product Status

Teswa Mobile is now a broad Arabic-first native social swap product across marketplace, stories, motion/video discovery, personal Living World recap, lightweight discover intelligence, emotional offer/deal milestones, premium auth entry, and a native security layer. The product also includes a stronger media-performance base and expanded native capability reserve. The latest Android Preview APK has been built, installed, and validated successfully on device.

## Implemented Product Systems

### 1. Core App Foundation
- Expo SDK 55, React Native, TypeScript, and Expo Router architecture.
- Arabic-first mobile UX with RTL readiness.
- Supabase-integrated mobile data/auth foundation.
- Mature routed mobile product structure with auth-aware navigation flows.
- Reusable UI primitives, design tokens, and richer ambient/premium surface patterns.

### 2. Auth, Onboarding & Native Entry
- Cinematic branded onboarding and premium first-entry flow.
- Premium login/signup/profile setup path.
- Native-first Google Sign-In with browser fallback compatibility.
- Supabase session exchange preserved across auth entry points.
- Smoother first-sign-in bootstrap/session handling from the latest expansion cycle.

### 3. Marketplace, Item Detail & Creator Studio
- Home and Discover marketplace browsing surfaces.
- Richer premium item detail presentation.
- Item video teaser support in discovery/detail contexts.
- Creator/Add-Item studio visual system with image/video media surfaces.
- Multi-step add-item flow remains intact (capture/import/compose/publish).

### 4. Offers, Deals, Messages & Emotional Utility
- Offer/deal lifecycle flows and decision support remain intact.
- Warmer communication hub across deal messaging contexts.
- Deal chat and voice-enabled messaging behavior.
- Emotional milestone cards for key moments, including offer sent, accepted-deal start, and confirmation/waiting/completed states.

### 5. Stories & Story Creation
- Story viewer with social interaction loop.
- Story likes, replies, and story voice replies.
- Native story camera studio and gallery entry points.
- Story publishing flow with contextual success/engagement surfaces.
- Improved viewer readiness/loading behavior and stronger nearby story/media prefetch posture.

### 6. Motion / حركة تِسوى
- Video-led discovery moments inside Motion.
- Fullscreen vertical Pulse Viewer behavior.
- Motion viewer that can combine story videos with item teaser videos.
- Cinematic CTA-style entry paths from Motion/Home/Discover where relevant.

### 7. Discover Intelligence & Living World
- Personal Living World recap card on Home.
- Discover Intelligence Light Layer.
- Discover story highlights rail.
- Spotlight rail.
- Lightweight scene interpretation/signals to improve discovery readability.

### 8. Offline Memory & Recovery
- SQLite-backed public JSON cache layer.
- Marketplace/Home/Discover warm-start behavior.
- Motion/People/detail/profile offline memory coverage.
- Background public-memory refresh.
- Foreground recovery refresh.

### 9. City Pulse / نبض تِسوى حولك
- Location/city/area-aware local pulse surfaces inside Motion.
- Nearby stories.
- Nearby moving items.
- Nearby story-rich items.
- Nearby people.
- Saved City Pulse memory.
- Local "نبض المدينة الآن" signal summaries.

### 10. Audio Moments / الصوت داخل عالم تِسوى
- Story voice replies.
- Voice messages inside contextual story reply threads.
- Voice-aware message summaries.
- Voice-aware notification copy.

### 11. Native Security & Device Trust
- Optional Biometric App Lock.
- Root lock coordinator behavior.
- Resume relock behavior.
- Local app-lock preference persistence.
- Secure local capability foundation/reserve for continued trust-layer hardening.

### 12. Media Performance Engine
- Cached video source handling.
- Image memory/disk prefetch behavior.
- Adjacent Pulse Viewer media warmups.
- Story/item media prefetch improvements.
- Graceful loading states in place of blank media transitions.

### 13. Native Capability Reserve Pack
Installed/reserved in the native binary to reduce future rebuild pressure (not all surfaced yet as full product features):
- `expo-secure-store`
- `expo-clipboard`
- `expo-document-picker`
- `expo-intent-launcher`
- `expo-store-review`
- `expo-media-library`
- `react-native-maps`

## Native Capability Coverage

Teswa intentionally treats native Expo/React Native capabilities as product surfaces, not just technical dependencies. Current coverage includes camera capture, image manipulation, video playback, audio recording/playback, sharing flows, notifications, location, haptics, offline SQLite memory, and background-task/foreground-recovery behavior, with additional native reserve capacity embedded for upcoming rollout layers.

## Current Track / Where We Are Now

- Product expansion through M43I is merged.
- Latest Android Preview APK validated successfully on device.
- Native Google Sign-In and Biometric App Lock are confirmed working in the APK.
- Immediate pre–Google Play step: **M43J — Teswa App Icon + Launch Identity Pack**.
- After icon/launch identity completion: Production AAB build, Google Play Console setup, then Internal Testing track rollout.

## Tech Stack

- Expo SDK 55 + React Native + TypeScript
- Expo Router
- Supabase (Auth, Database, Storage, Edge Functions)
- Native auth/security: Google Sign-In, Expo Local Authentication, Expo Secure Store
- Media/motion: Expo Camera, Expo Audio, Expo Video, Expo Image, Expo Image Manipulator, Expo Media Library
- Platform/device ops: Expo Notifications, Expo Location, Expo Store Review, Expo Document Picker, Expo Intent Launcher, Expo Clipboard, Expo Sharing
- Data/performance: SQLite
- UI/motion: Reanimated, Skia, and Lottie (where relevant)
- Maps foundation: React Native Maps

## Setup

```bash
npm install
cp .env.example .env
npx expo start
```

## Environment Variables

Add these in `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (used by native-first Google Sign-In orchestration and browser fallback compatibility)

Server-side secrets (for push delivery and other backend operations) should remain in operational/runtime configuration rather than mobile client environment variables.

## Launch Options

```bash
npx expo start
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Preview APK + OTA Updates

- Build and install a Preview APK for native-layer changes (dependencies/plugins/config/runtime-native behavior):
  ```bash
  eas build --platform android --profile preview
  ```
- Ship JS/UI/business-logic updates over OTA when native runtime compatibility is unchanged:
  ```bash
  eas update --channel preview --message "..."
  ```
- Native dependency/plugin/config changes still require a new APK/AAB build.
- The preview APK + OTA workflow is active and used as the current delivery path.

## Google Play Readiness

Teswa is now approaching Google Play Internal Testing.

Immediate flow:
1. Finalize App Icon / Launch Identity.
2. Build Production AAB.
3. Configure Google Play Console.
4. Run Internal Testing rollout.

Note: after Play Console setup, Google Sign-In distribution may require adding the **Play App Signing SHA-1** to the Google Cloud Android OAuth client configuration.

## Push Delivery Operations

Remote push fanout is handled backend-side for new `public.notifications` inserts via Supabase Database Webhook events routed into the `send-notification-push` Edge Function, which delivers to active Expo tokens from `public.push_devices`.

Required Edge Function secret:
- `TESWA_PUSH_WEBHOOK_SECRET`

Required operational setup:
1. Deploy the Edge Function: `supabase/functions/send-notification-push`.
2. Set the Edge Function secret `TESWA_PUSH_WEBHOOK_SECRET`.
3. Create a Supabase Database Webhook on `public.notifications` for `INSERT` events.
4. Point the webhook URL to the deployed `send-notification-push` function URL.
5. Configure webhook request headers with:
   - `x-teswa-push-webhook-secret: <same secret>`

This delivery flow is operational/backend-side and does not require mobile source changes by itself.
