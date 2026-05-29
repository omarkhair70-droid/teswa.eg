# Phase 0F.2 — Reliable Direct Chat media controls

## Scope

This is an OTA-safe stabilization pass.

It does not add packages and does not change:

- Direct Chat send/upload payloads
- Stream connection logic
- Direct Chat cache
- video thumbnail generation
- image viewer design
- app config
- native permissions

## What changed

Direct Chat voice playback is now guarded against rapid repeated taps and overlapping playback.

The playback flow now:

- tracks a local playback busy state
- ignores repeated playback taps while a transition is in progress
- stops the current voice before replacing it with another one
- clears playback state when playback fails
- clears playback state when leaving or switching conversations
- pauses/seeks voice playback during screen cleanup

## Manual QA

- Open an accepted Direct Chat.
- Play a voice message.
- Tap the same voice message quickly.
- Tap a different voice message quickly.
- Confirm only one voice message is active at a time.
- Leave the chat while a voice message is playing.
- Reopen the chat and confirm playback state is clean.
- Confirm image/video/file viewers still open normally.

## Testing

Run:

- npm run typecheck
- git diff --check
- npx expo-doctor
