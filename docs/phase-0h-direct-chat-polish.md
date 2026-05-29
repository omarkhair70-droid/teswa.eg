# Phase 0H — Direct Chat reliability and polish

## Scope

This is an OTA-safe Direct Chat polish pass.

It does not add packages and does not change:

- Stream connection logic
- Direct Chat cache
- message send/upload payloads
- video thumbnail generation
- native config

## What changed

- Adds a reaction busy guard so repeated reaction taps do not spam Stream.
- Disables heart/thumbs reaction actions while a reaction is being sent.
- Improves reply preview copy and accessibility label.

## Manual QA

- Open an accepted Direct Chat.
- Long press a message.
- Tap heart reaction quickly more than once.
- Confirm it does not spam duplicate requests.
- Tap thumbs-up quickly more than once.
- Confirm feedback remains stable.
- Tap reply.
- Confirm reply preview appears clearly.
- Cancel reply.
- Send a reply and confirm chat behavior remains stable.

## Testing

- npm run typecheck
- git diff --check
- npx expo-doctor
