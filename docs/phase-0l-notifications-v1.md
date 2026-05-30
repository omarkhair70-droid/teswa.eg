# Phase 0L — Notifications V1

## Scope

This is an OTA-safe notification center polish pass.

It does not add packages and does not change native configuration, push credentials, notification permissions, or backend contracts.

## What changed

- Added a notification center summary card.
- Shows unread and total recent notification counts.
- Adds explicit refresh and mark-all-read actions in the center summary.
- Adds calmer loading and empty states.
- Adds route hints for notification cards so users understand what will open.
- Keeps existing mark-read and route resolution behavior.

## Manual QA

- Open Notifications while logged in.
- Confirm summary counts render.
- Tap refresh.
- Tap mark all as read when unread notifications exist.
- Tap a routeable notification and confirm it opens the right screen.
- Confirm non-routeable read notifications remain visible but do not act like broken buttons.
- Confirm empty state renders when the list is empty.

## Testing

- npm run typecheck
- git diff --check
- npx expo-doctor
