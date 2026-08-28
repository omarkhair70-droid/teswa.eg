<p align="center">
  <img src="assets/branding/icon.png" alt="Teswa app icon" width="120" />
</p>

# Teswa Mobile (تِسوى)

<p align="center">
  <strong>An Arabic-first social swap marketplace for giving useful things a second life.</strong>
</p>

<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.teswa.mobile"><strong>Google Play</strong></a>
  ·
  <a href="https://teswa-eg.vercel.app"><strong>Web</strong></a>
</p>

> **حاجتك لسه لها قيمة.**  
> قبل ما تسيبها، شوف تِسوى إيه.

Teswa is a published Android product that combines item swapping, social discovery, stories, messaging, local activity, and native mobile capabilities in an Arabic-first experience.

## What Teswa Is

Teswa helps people discover new value in things they already own. Users can publish items, explore people and activity around them, exchange offers, coordinate through messaging, and build trust through profiles and completed-deal signals.

The product is built as a native mobile experience rather than a simple marketplace listing surface: marketplace activity, stories, motion/video discovery, social communication, offline memory, local signals, and device-level capabilities work together as one product system.

## Strongest Product Systems

1. **Marketplace & Creator Studio** — item discovery, rich item detail, multi-step publishing, image/video media surfaces, offers, and deal lifecycle flows.
2. **Social Messaging & Deal Coordination** — direct/deal conversations, voice-enabled messaging, warm communication states, and milestone-driven deal UX.
3. **Stories & Motion** — story creation/viewing, replies, voice moments, fullscreen vertical video discovery, and item/story media crossover.
4. **Living World & Local Discovery** — personal recap surfaces, Discover intelligence, spotlight rails, City Pulse, nearby items, stories, people, and local activity signals.
5. **Offline Memory & Media Performance** — SQLite-backed public cache, warm-start behavior, foreground recovery, image/video prefetch, and graceful media loading.
6. **Native Mobile Capabilities** — camera, audio, video, notifications, location, haptics, sharing, media-library flows, local authentication, and secure local storage.
7. **Trust, Security & Release Operations** — biometric app lock, privacy-bounded analytics foundations, trust/badge presentation, push-delivery infrastructure, EAS builds, and OTA release workflows.

## Product Screens

<p align="center">
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/01-discovery-hub.webp" alt="Teswa discovery hub" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/03-marketplace-feed.webp" alt="Teswa marketplace feed" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/04-item-detail.webp" alt="Teswa item detail" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/06-exchange-chat.webp" alt="Teswa exchange chat" width="23%" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/07-create-listing.webp" alt="Teswa create listing" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/08-profile.webp" alt="Teswa profile" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/09-trust.webp" alt="Teswa trust" width="23%" />
  <img src="https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/10-movement.webp" alt="Teswa movement" width="23%" />
</p>

## Architecture

```text
React Native / Expo SDK 55
        │
        ├── Expo Router + TypeScript product UI
        ├── Native Expo device/media capabilities
        ├── SQLite offline memory + recovery
        │
        └── Supabase
            ├── Auth
            ├── PostgreSQL data
            ├── Storage
            └── Edge Functions / backend operations
```

**Core stack:** React Native, Expo, Expo Router, TypeScript, Supabase, SQLite, Reanimated, Skia, Lottie, Google Sign-In, Expo Notifications, Expo Location, Expo Camera/Audio/Video, EAS Build, and EAS Update.

---

## Detailed Product & Engineering Notes

The sections below preserve the detailed implementation, operational, release, and product-history record for maintainers and technical review.

## Current Product Status

Teswa Mobile is live/post-launch on Google Play as a broad Arabic-first native social swap product across marketplace, stories, motion/video discovery, personal Living World recap, lightweight discover intelligence, emotional offer/deal milestones, premium auth entry, and a native security layer.

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
- Home currently uses the simpler default marketplace feed UI after rollback of in-Home search/filter controls and nearby discovery toggle/radius chips from production UX testing.
- Existing backend/Supabase foundations for search/nearby can remain for future controlled re-introduction.
- Default offline first-page cache behavior remains active on Home (fresh cache read, network refresh, stale fallback).
- No startup/splash, push, or notification-settings hotfix behavior was reverted by this rollback.
- Richer premium item detail presentation.
- Item video teaser support in discovery/detail contexts.
- Creator/Add-Item studio visual system with image/video media surfaces.
- Multi-step add-item flow remains intact (capture/import/compose/publish).

### 4. Offers, Deals, Messages & Emotional Utility
- Recent copy pass keeps inbox/direct/profile surfaces warm and social while preserving the simplified UI and backend behavior.
- Offer/deal lifecycle flows and decision support remain intact.
- Warmer communication hub across deal messaging contexts.
- Deal chat and voice-enabled messaging behavior.
- Deal chat surface simplified to a cleaner social conversation flow, with completion/report/block actions moved into a lightweight menu (no backend/business-logic changes).
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

- Teswa is live/post-launch on Google Play.
- Product expansion through M43I is merged.
- Push notifications and core social swap flows are operational in production.

## Startup Fast Re-entry Note

- Trusted cached account gate now enables fast app re-entry without blocking UI routing on profile/policy network revalidation.
- Profile and policy checks are still preserved and continue in the background.
- No security/policy validation paths were removed.
- A local/dev-only startup timing trace is available to diagnose bootstrap and gate timing.

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
- `EXPO_PUBLIC_SHARE_BASE_URL` (public HTTPS base used for externally shared item links; format: `https://your-domain.com` without trailing slash. Example shape: `https://example.com`. When set, item share uses clickable HTTPS `/item/:id`; when unset, sharing falls back to app deep-link text and does not promise public web clickability)

### Media Share

- Visual item share cards are generated locally on-device via view capture and shared as an image when platform sharing supports it.
- No generated share-card image is uploaded to Teswa storage or backend services.
- Existing text/link sharing remains the fallback path when image sharing is unavailable or fails.
- No extra permissions or native dependencies were added for item share cards.
- Add item flow also includes an optional video teaser UX for listings.
- Video teaser maximum duration remains 15 seconds.
- Full video compression pipeline is intentionally deferred to a later roadmap PR.

Server-side secrets (for push delivery and other backend operations) should remain in operational/runtime configuration rather than mobile client environment variables.

## Launch Options

```bash
npx expo start
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Release Operations

- Build and install an Android release artifact for native-layer changes (dependencies/plugins/config/runtime-native behavior):
  ```bash
  eas build --platform android --profile production
  ```
- Ship JS/UI/business-logic updates over OTA when native runtime compatibility is unchanged:
  ```bash
  eas update --channel production --message "..."
  ```
- Native dependency/plugin/config changes still require a new APK/AAB build.

## Google Play Readiness

Teswa is already live on Google Play. Ongoing work focuses on release quality, operational reliability, and incremental product expansion.

Note: after Play Console setup, Google Sign-In distribution may require adding the **Play App Signing SHA-1** to the Google Cloud Android OAuth client configuration.

## Push Delivery Operations

Remote push fanout is handled backend-side for new `public.notifications` inserts via Supabase Database Webhook events routed into the `send-notification-push` Edge Function, which delivers to active Expo tokens from `public.push_devices`.

Required Edge Function secret:
- `TESWA_PUSH_WEBHOOK_SECRET`

Required operational setup:
1. Deploy the Edge Function: `supabase/functions/send-notification-push`.
2. Set Edge Function secrets:
   - `TESWA_PUSH_WEBHOOK_SECRET`
   - `SUPABASE_SERVICE_ROLE_KEY` (already present in Supabase Edge runtime for most projects; verify before testing)
3. Create a Supabase Database Webhook on `public.notifications` for `INSERT` events.
4. Point the webhook URL to the deployed `send-notification-push` function URL.
5. Configure webhook request headers with:
   - `x-teswa-push-webhook-secret: <same secret>`
6. Verify webhook status is **Active** and capture failed deliveries from webhook logs if pushes are not arriving.

Validation query (SQL editor) for recipient device registration:
```sql
select user_id, expo_push_token, notifications_enabled, disabled_at, last_registered_at
from public.push_devices
where user_id = '<RECIPIENT_USER_ID>'
order by last_registered_at desc;
```

This delivery flow is operational/backend-side and does not require mobile source changes by itself.

## Badges Foundation

- Trust level presentation labels/icons/descriptions are centralized in `lib/trust-level-presentation.ts` for consistent Arabic-first trust language.
- Trust and badge UI remains aggregate-only and privacy-safe on client surfaces.
- No trust scoring logic changed in this PR; presentation-only polish.
- Profile badge UI uses only safe public fields returned by badge RPC reads (label/category/icon/date).
- Mobile client does not read raw `user_badges` table rows directly.
- No badge animations, missions, streaks, or leaderboards are included in this roadmap PR.
- Core badge definitions were polished for `first_swap` and `reliable_swapper`.
- Badge presentation is centralized in `lib/badge-presentation.ts`.
- No badge award rules or trust scoring changed in this PR.
- Raw `user_badges` rows remain inaccessible directly to the mobile client.
- Profile Achievement Summary combines safe aggregate trust metrics and public badge fields.
- No scoring or award rules changed for this summary.
- No raw badge rows or private data are exposed by this summary surface.

## First-party Analytics

Teswa uses a first-party Supabase analytics foundation via `public.analytics_events` and the `public.track_analytics_event(...)` RPC.

Privacy rules in this foundation:
- Never send raw message bodies, item descriptions/titles, offer notes, names, phone/email, tokens, secrets, or push tokens.
- Event metadata is object-only JSON and should contain safe booleans/counts/status/category-like values.
- Mobile client tracking fails silently in local/dev if migration/RPC is missing.

The current app sends a focused initial set of lifecycle/product events for authenticated users only.

## Badges Foundation

Teswa now includes a safe badge data foundation for future premium gamification/profile achievement surfaces.

- Badge definitions live in `public.badge_definitions`.
- User-awarded badge rows live in `public.user_badges`.
- First system auto-awarded badges are:
  - `first_swap`
  - `reliable_swapper`
- `early_swapper` and `founder_badge` are manual-only for now (not auto-awarded).
- RLS and SECURITY DEFINER RPCs expose only safe public badge fields.
- Profile badge UI now consumes only safe public RPC-returned badge fields.
- No private data is exposed by badge APIs.

## Notification Preferences Foundation

- Notification preferences UI/foundation is now available for logged-in users from profile settings (`إعدادات الإشعارات`).
- Stored fields include category toggles and quiet-hours style values (`quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`).
- Delivery enforcement for every category/quiet hours can be wired in later Edge Function/RPC patches.
- This update does not claim full backend suppression unless explicitly wired in backend delivery logic.


## Direct Social Messaging Foundation
- Direct profile messages added with request gate.
- Relationship gate now treats active/coordinating deal states (`coordinating`, `completed_pending_confirmation`, `completed`) as trusted and opens direct chat as accepted.
- Messages tab is simplified visually: conversations (direct/deal/story) appear as one social inbox, while offers stay separate.
- Deal chats and story reply threads remain separate.
- Writes go through RPCs; no broad direct client table writes.
- Push notifications for direct messages deferred.

- Direct messaging text core was stabilized ahead of premium voice work.
- Failed message refresh no longer clears already visible chat messages.
- Direct chat now supports safer single-conversation loading via dedicated RPC.
