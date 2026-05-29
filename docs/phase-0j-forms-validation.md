# Phase 0J — Forms and validation adoption

## Scope

This is an OTA-safe first adoption of the existing form foundation.

It does not add packages and does not change backend contracts.

## What changed

The user report screen now uses the shared form foundation:

- `react-hook-form`
- `zod`
- `zodResolver`

Validation is intentionally small:

- report reason is required
- details are capped at 800 characters
- details are required when selecting "سبب آخر"

## Manual QA

- Open a user profile.
- Open report user.
- Try submitting without choosing a reason.
- Choose "سبب آخر" and submit without details.
- Add details and confirm submission works.
- Choose a normal reason and confirm details stay optional.
- Confirm successful state still appears.

## Testing

- npm run typecheck
- git diff --check
- npx expo-doctor
