# Direct Chat toast feedback

Direct Chat now routes short, one-shot action feedback through the shared `lib/toast.ts` helper, which is backed by `react-native-toast-message`. The previous transient `actionFeedback` inline card was removed from the chat render path so these events do not show both a toast and a feedback card.

## Feedback moved to toast

The following Direct Chat events use toast feedback because they are brief confirmations, recoverable errors, or status updates that should not change the chat layout:

- Message actions: copied text, reply activated, reaction added or unavailable/failed, report result, delete result, and Direct Chat action availability errors.
- Dolab actions: message saved, already saved, nothing to save, composer draft saved, media saved from the viewer, and Dolab shareable loading errors.
- Media actions: image/video/file picker permission or selection failures, media upload/send availability or failure, copied media URL, and open/viewer URL errors.
- Voice actions: recording started, recording canceled, missing recording, microphone permission failure, voice send in progress, voice send failure, and voice playback errors.
- Exchange/Dolab share short guidance: unsupported Dolab share items, missing exchange item/note, Deal Chat availability guidance, and exchange offer send result.
- Conversation action confirmations: block and unblock success notifications.

## Feedback that remains inline

Inline UI remains for state that is persistent, blocking, or part of the message composition flow:

- `streamError`, because it blocks Direct Chat sending/connection readiness and needs to stay visible until resolved.
- Conversation-level `error`, because it represents persistent conversation or moderation/action failures that should remain visible in context.
- Request, blocked, and ignored conversation cards, because they describe durable conversation state and expose required actions.
- Pending attachment and pending voice composer cards, because they are active composition state the user can review or cancel before sending.
- Stream status, exchange context, and media viewer loading/error surfaces, because they describe current screen state rather than a completed action.

## Future replacement plan for other screens

1. Audit screens for short-lived inline feedback cards or temporary state used only for confirmations/errors.
2. Move safe one-shot events to `showToast({ title, message, type })` from `lib/toast.ts`.
3. Keep inline cards for persistent, blocking, multi-step, or actionable guidance.
4. Remove obsolete feedback state after each screen migration to avoid duplicate toast/card feedback.
5. Add manual QA cases for each migrated screen to verify the toast appears and no inline duplicate is rendered.
