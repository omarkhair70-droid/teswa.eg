# Settings foundation

This PR adds the first layer for Teswa settings without redesigning the app or moving sensitive account flows.

## Appearance preference plan

- Supported stored values are `system`, `light`, and `dark`.
- The preference is stored locally with the existing MMKV-backed storage helper.
- `ThemePreferencesProvider` resolves the active semantic token set from the stored preference plus the OS color scheme.
- Existing screens still use `constants/colors.ts`; dark mode is not forced across the app yet.
- `app.config.js` is prepared with `userInterfaceStyle: 'automatic'` so native UI can follow the system when safe.

## Language and i18n plan

- Default app language remains Arabic.
- Supported language preferences are `ar`, `en`, and `system`.
- `lib/i18n/index.ts` exposes a small `t(key)` helper for incremental translation work.
- English is available as a preference foundation, but full translation is intentionally not part of this PR.
- RTL/LTR direction is still controlled by the current app startup direction. Changing between Arabic and English layout direction can require an app restart and may need additional native `I18nManager` handling later.

## Settings route map

- `/settings` — foundation screen with Appearance, Language, Notifications, Privacy & Safety, Account, and About sections.
- `/settings/notifications` — existing notification preferences.
- `/settings/direct-privacy` — existing direct message privacy settings.
- `/legal/privacy`, `/legal/terms`, `/legal/community-guidelines` — existing policy routes linked from settings.
- `/profile/edit` and `/account-deletion` — existing account-related routes linked without moving destructive deletion behavior.

## Intentionally not changed yet

- No Supabase migrations.
- No Direct Chat behavior changes.
- No large redesign or mass icon replacement.
- No full translation migration.
- No link preview backend.
- No markdown rendering.
- No Add Item form refactor.
