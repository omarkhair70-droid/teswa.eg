# Teswa Mobile (تِسوى)

Teswa is an Arabic-first mobile swap marketplace where people exchange items instead of traditional buying/selling.

Core lines:
- "حاجتك لسه لها قيمة."
- "قبل ما تسيبها، شوف تِسوى إيه."

## Phase Status
Phase M1: **Completed**.

Phase M2: **Completed** (Auth + Onboarding merged and verified in Android development build).

Phase M3: **Marketplace browsing foundation implemented** (Home feed, Discover browse/search foundation, reusable item cards, and item details read-only data flow).

Included now:
- Expo + TypeScript + Expo Router scaffolding
- Arabic-first RTL groundwork
- Design tokens and reusable base UI primitives
- Placeholder route map for full app architecture
- Supabase React Native client shell with env wiring

Deferred to Phase M4+ (still intentionally out of scope):
- Item creation/editing and image upload
- Offers, deals, chat/messages, notifications
- Payments, advanced backend integrations

## Tech Stack
- Expo (SDK 55 structure)
- React Native + TypeScript
- Expo Router
- Supabase JS client (shell only)

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

## RTL Note
The app enables RTL support via `I18nManager.allowRTL(true)` and intentionally does **not** force RTL at runtime, preserving device/user preference while keeping layouts Arabic-first ready.

## Launch Options
```bash
npx expo start
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Preview APK + OTA Updates
- Build the installable preview APK once:
  ```bash
  eas build --platform android --profile preview
  ```
- Publish future non-native preview updates (JS/UI/logic only):
  ```bash
  eas update --channel preview --message "..."
  ```
- Native dependency/config changes still require a new preview APK build.


## M10A Native Engagement Foundation

- Added native push foundation with `expo-notifications` + `expo-constants`, device-token registration, and push-tap routing setup.
- Added push-device persistence contract in Supabase (`push_devices`, `register_push_device`, `disable_my_push_device`).
- Added in-app unread badges for Messages and Profile notifications with lightweight refresh hooks.
- M10A **does not** send server-triggered remote push yet; delivery fanout is planned for **M10B**.
- Because `expo-notifications` uses native config/plugins, M10A requires a **new Preview APK / EAS build** after merge (first install is not OTA-only).
- When M10B begins, Android push delivery tests require valid Expo/EAS notification credentials.

## M10B Server-side Remote Push Delivery

M10B adds backend-only remote push fanout for new `public.notifications` inserts by routing Supabase Database Webhook events into the `send-notification-push` Edge Function, which then delivers to active Expo tokens from `public.push_devices`.

Required Edge Function secret:
- `TESWA_PUSH_WEBHOOK_SECRET`

Required operational setup after merge:
1. Deploy the Edge Function: `supabase/functions/send-notification-push`.
2. Set the Edge Function secret `TESWA_PUSH_WEBHOOK_SECRET`.
3. Create a Supabase Database Webhook on `public.notifications` for `INSERT` events.
4. Configure the webhook URL to target the deployed `send-notification-push` function URL.
5. Configure webhook request headers with:
   - `x-teswa-push-webhook-secret: <same secret>`

M10B is server-side/backend-only and does **not** require changing the mobile APK.
