# Phase 0I — Home / Item perceived speed

## Scope

This is an OTA-safe perceived-speed polish pass.

It does not add packages and does not change:

- native config
- query/cache contracts
- item payloads
- marketplace APIs
- telemetry schema

## What changed

- Adds a calmer Home feed loading state.
- Adds a clearer Home feed error state with retry.
- Adds a more useful Home empty state with create-item action.
- Adds an Item Detail loading skeleton-style state.
- Adds a clearer Item Detail retry error state.

## Manual QA

- Open Home from a cold app start.
- Confirm top sections remain stable while feed loads.
- Confirm empty/error feed states look intentional.
- Open an item detail.
- Confirm loading state is stable before content appears.
- Force/refetch error if possible and confirm retry works.

## Testing

- npm run typecheck
- git diff --check
- npx expo-doctor
