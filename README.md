# Teswa Mobile (تِسوى)

Teswa is an Arabic-first mobile swap marketplace where people exchange items instead of traditional buying/selling.

Core lines:
- "حاجتك لسه لها قيمة."
- "قبل ما تسيبها، شوف تِسوى إيه."

## Phase Status
Phase M1: **Foundation only**.

Included now:
- Expo + TypeScript + Expo Router scaffolding
- Arabic-first RTL groundwork
- Design tokens and reusable base UI primitives
- Placeholder route map for full app architecture
- Supabase React Native client shell with env wiring

Deferred to Phase M2:
- Real auth and onboarding flows
- Data fetching, feeds, offers, messages, notifications logic
- Backend features and production integrations

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
