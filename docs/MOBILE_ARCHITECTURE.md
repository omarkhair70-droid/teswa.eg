# Teswa Mobile Architecture — Phase M1

## Routing Structure
- Root stack: `app/_layout.tsx`
- Auth group: `app/(auth)/*`
- App tabs: `app/(tabs)/*`
- Deep routes: item, offer, deal, notifications, profile, settings

## UI Foundation
- Design tokens in `constants/` for colors, spacing, radii, typography, shadows.
- Base UI primitives in `components/ui/`:
  - AppText, AppButton, AppScreen, AppCard, AppInput, SectionHeader, EmptyState
- Shared placeholder composition for scaffold screens.

## Supabase Shell
- `lib/supabase/client.ts`
- Uses EXPO_PUBLIC vars and RN-safe auth persistence via AsyncStorage.

## Next Phases (M2+)
- Auth + onboarding flow implementation
- Profile completion and trust indicators
- Swap feed/discovery and filters
- Offer lifecycle and deal chat
- Notifications and settings behaviors
