# Phase 0K — Visual system adoption

## Scope

This is an OTA-safe visual-system adoption pass.

It does not add packages and does not change native configuration.

## What changed

- Added `AppInfoRow` as a reusable UI primitive for label/value information rows.
- Updated `SettingsStatusCard` to use the shared visual primitive instead of local one-off row styling.
- Kept the adoption intentionally small so older screens are not visually disrupted.

## Why

The app already has a foundation for icons, tokens, toasts, forms, and settings. This phase starts moving repeated UI patterns into shared components so future screens can become more consistent without large rewrites.

## Manual QA

- Open Settings.
- Scroll to About.
- Confirm app version, runtime, and channel still appear.
- Confirm the new rows fit on small screens.
- Confirm no Settings routes are broken.

## Testing

- npm run typecheck
- git diff --check
- npx expo-doctor
