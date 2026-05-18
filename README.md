# Teswa Mobile (تِسوى)

Teswa is an Arabic-first mobile swap marketplace evolving into a living social exchange world where items, stories, people, and local activity create value beyond traditional buying/selling.

Core lines:
- "حاجتك لسه لها قيمة."
- "قبل ما تسيبها، شوف تِسوى إيه."

## Current Product Status

Teswa Mobile has progressed far beyond initial app foundation and now ships as a broad native product system. Teswa Mobile currently includes a functioning native marketplace, social story layer, motion/discovery surfaces, local city pulse, voice interactions, and offline/resilience systems.

## Implemented Product Systems

### 1. Core App Foundation
- Expo SDK 55, React Native, TypeScript, and Expo Router architecture.
- Arabic-first mobile UX with RTL readiness.
- Supabase-integrated mobile data/auth foundation.
- App routing, auth-aware navigation flows, design tokens, and reusable UI primitives.

### 2. Auth & Onboarding
- Branded splash and onboarding flow.
- Login/signup/session redirect behavior.
- Initial profile setup and early account shaping.

### 3. Marketplace & Item Discovery
- Home and Discover browsing surfaces.
- Item detail screen and listing context.
- Marketplace cards and discovery navigation flows.
- Nearby/location-aware discovery foundation.

### 4. Add Item Native Studio
- Native item photo capture studio.
- Multi-photo capture support.
- Gallery intake/import.
- Image composer/editing flow.
- Draft/publish foundations integrated into add-item experience.

### 5. Offers, Deals, Messages
- Offer/deal lifecycle flows.
- Deal chat experience.
- Voice messages in deal conversations.
- Unread badges and message-center behaviors.

### 6. Notifications
- Expo push registration and persisted device-token handling.
- Supabase notification data model.
- Server-side push fanout through Edge Function + webhook routing.
- Contextual story-reply notification routing.
- Voice-aware contextual notification copy.

### 7. Stories & Story Creation
- Story viewer with social interaction loop.
- Story likes and replies.
- Native story camera studio.
- Gallery upload entry points.
- Story image composer.
- Publishing overlay and success state.
- Contextual reply thread surfaces.

### 8. Motion / حركة تِسوى
- Motion 2.0 mixed discovery feed.
- Motion hero/pulse visual experience.
- Shareable Motion moments.
- Story-rich and moving-item discovery behavior.

### 9. Offline Memory & Recovery
- SQLite-backed public JSON cache layer.
- Marketplace/Home/Discover warm-start behavior.
- Motion/People/detail/profile offline memory coverage.
- Background public-memory refresh.
- Foreground recovery refresh.

### 10. City Pulse / نبض تِسوى حولك
- Location-based local pulse inside Motion.
- Nearby stories.
- Nearby moving items.
- Nearby story-rich items.
- Nearby people.
- Saved City Pulse memory.
- Local "نبض المدينة الآن" signal summaries.

### 11. Audio Moments / الصوت داخل عالم تِسوى
- Story voice replies.
- Voice messages inside contextual story reply threads.
- Voice-aware message summaries.
- Voice-aware notification copy.

## Native Capability Coverage

Teswa intentionally treats native Expo/React Native capabilities as product surfaces, not just technical dependencies. Current coverage includes camera capture, image manipulation, video playback, audio recording/playback, sharing flows, notifications, location, haptics, offline SQLite memory, and background-task/foreground-recovery behavior.

## Current Track / Where We Are Now

The Living World track is underway and has completed:
- M37 City Pulse
- M38 Audio Moments / Audio Presence

Next product expansion will continue the Living World track by deepening media-rich motion, video-led discovery, or other high-impact world-building layers.

## Tech Stack

- Expo SDK 55
- React Native
- TypeScript
- Expo Router
- Supabase (Auth, Database, Storage, Edge Functions)
- Expo Notifications
- Expo Camera
- Expo Audio
- Expo Video
- Expo Image
- Expo Image Manipulator
- Expo Location
- Expo Sharing / share flows
- SQLite
- Reanimated, Skia, and Lottie (where relevant)

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

Server-side secrets (for push delivery and other backend operations) should remain in operational/runtime configuration rather than mobile client environment variables.

## Launch Options

```bash
npx expo start
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Preview APK + OTA Updates

- Build and install a Preview APK when native dependencies/configuration change:
  ```bash
  eas build --platform android --profile preview
  ```
- Ship many JS/UI/business-logic-only updates over OTA when the native layer is unchanged:
  ```bash
  eas update --channel preview --message "..."
  ```
- Any native dependency/plugin/config changes still require a new Preview APK build.

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
