# Phase 0G — Settings polish

## Goal

Make Settings more useful and support-friendly while staying OTA-safe.

## Scope

This phase does not add packages and does not change native configuration.

It focuses on:

- clearer settings copy
- better notification/settings entry points
- useful About/app status information
- keeping appearance and language preferences honest about current support

## What changed

Settings now has a reusable status card for app support information.

The About area can show:

- app version
- runtime version
- production channel

## Manual QA

- Open Settings.
- Confirm all sections render without crashing.
- Confirm Appearance options still save.
- Confirm Language options still render.
- Open notification settings.
- Open notification center.
- Open direct privacy.
- Open legal/privacy routes.
- Confirm About information appears.

## Testing

Run:

- npm run typecheck
- git diff --check
- npx expo-doctor
