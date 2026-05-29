# Direct Chat and Stream Chat Capability Audit

_Last audited: 2026-05-28. This is an audit-only plan; it does not change runtime behavior._

## Executive recommendation

Teswa should **keep the current custom Direct Chat shell and custom composer for the next phase**, and adopt Stream SDK features selectively underneath it:

1. Keep custom list/composer now because they encode Teswa-specific request gating, Arabic RTL bubble identity, Dolab sharing/saving, exchange-offer draft cards, reporting, block actions, notification handoff, and Expo-specific audio/video choices.
2. Use Stream's **channel state, events, upload APIs, reactions, typing, read state, and eventually offline/drafts** as service capabilities.
3. Delay a full `MessageList` / `MessageComposer` migration until after parity hardening, because `stream-chat-expo@9.3.0-beta.4` pulls the v9 UI layer and the installed dependency is beta. The v9 docs describe a redesigned UI layer, so visual and behavior churn is a risk.
4. Build a local instant-open cache owned by Teswa before attempting Stream offline support. Stream offline needs an additional SQLite native dependency that is not installed, and this PR must not add packages.

## Files audited

### Production Direct Chat

- `app/direct/[id].tsx`
  - Main Direct Chat screen.
  - Fetches Supabase direct conversation metadata, uses Stream only for accepted conversations when `isDirectChatProEnabled()` is true, and retains Supabase legacy messages for requested/blocked/ignored/non-pro paths.
  - Owns all current custom UI: header/context strip, request accept/ignore card, custom scroll list, bubbles, custom composer, attachment picker, voice recording, reactions action sheet, Dolab save/share, report, block, image/video/file viewer.

### Chat lab / pilots

- `app/chat-lab/direct-pilot.tsx`
  - Minimal single-user Stream connection proof.
  - Dynamically imports `stream-chat-expo`, connects user from `fetchStreamChatToken()`, watches a `teswa-direct-pilot-*` channel, sends text, and renders fallback local cards.
- `app/chat-lab/direct-conversation.tsx`
  - Direct-conversation Stream lab.
  - Loads a real direct conversation, only watches Stream when status is `accepted`, maps via `getStreamDirectChannelConfig`, sends text, and shows connection/status metadata.

### Direct / Stream bridge files

- `lib/direct-messages.ts`
  - Supabase RPC wrapper for direct conversation metadata, legacy messages, send, request accept/ignore, read marking, and legacy direct voice upload helpers.
- `lib/chat/stream-token.ts`
  - Fetches a Stream token from the `stream-chat-token` Supabase Edge Function, passing optional direct context/user profile metadata.
- `lib/chat/stream-client.ts`
  - Warm client helper and cold connect helper using the low-level `stream-chat` package.
- `lib/chat/stream-direct-mapping.ts`
  - Sanitizes the Teswa conversation id into `teswa-direct-{conversationId}` and returns a `messaging` channel config with the two direct members.
- `lib/dolab/chat-bridge.ts`
  - Saves direct chat text/attachments into Dolab, saves composer drafts, and loads recent Dolab shareables for insertion into Direct Chat.

### Push notification routing/actions

- `lib/notification-actions.ts`
  - Registers Expo notification actions for direct messages: reply, like, open chat.
- `lib/push-notifications.ts`
  - Resolves push payloads with `conversationId` to `/direct/{conversationId}` and accepts safe `/direct/` routes.
  - Parses action identifier and user text from notification responses.
- `app/_layout.tsx`
  - Queues direct notification taps/actions to the direct route after account gate/bootstrap; reply/like/open-chat currently navigate to the conversation rather than performing background send/reaction.
- `lib/notifications.ts`
  - Adds `direct_message_received` to notification types/labels and resolves notification rows with `/direct/` routes.
- `app/notifications.tsx`
  - Opens notification routes and marks notifications read.
- `app/(tabs)/messages.tsx`
  - Shows Direct rows in the unified inbox and routes rows to `/direct/{conversationId}`.

## Current architecture findings

### Metadata source

- Conversation metadata is Supabase-owned through `fetchDirectConversation(conversationId)`, which calls `get_direct_conversation` and normalizes status, requested-by user, other user identity, last message metadata, unread count, and `requiresAction`.
- The production screen always loads this metadata first. Stream is not the source of truth for request state, participant display metadata, privacy/blocking, item context, or inbox unread summary.
- Current user display metadata passed to Stream token setup comes from Supabase auth `user_metadata.display_name`, `full_name`, and `avatar_url`.

### Accepted conversation behavior

- If `DIRECT_CHAT_PRO_ENABLED` is true and the conversation status is `accepted`, the screen switches to Stream-backed Direct Chat.
- Accepted Stream mode clears legacy Supabase messages, renders a custom context strip (`Stream مباشر`), and enables attachments, audio, reactions, read state, typing, and exchange-offer draft actions only when the Stream channel is ready.
- The custom composer is disabled while the Stream channel is connecting or unavailable.

### Stream connection/watch/hydration

- `connectStream()` fetches a scoped Stream token with conversation/member context, reuses a warm client when possible, otherwise connects via `connectStreamClientWithToken()`.
- The channel id/type/members come from `getStreamDirectChannelConfig({ conversationId, currentUserId, otherUserId })`, then `channel.watch()` is called.
- Hydration maps `channel.state.messages` into Teswa's `StreamMessage` shape, including text, user identity, reaction counts, own reactions, attachments, custom `teswa_*` fields, and quoted message data.
- The screen subscribes to `message.new`, `message.updated`, `message.deleted`, `typing.start`, and `typing.stop`, then rehydrates from channel state.
- The screen derives read state by scanning `channel.state.read` for the other user's latest `last_read` timestamp.

### Legacy fallback / requested conversation behavior

- If Stream Direct Chat is disabled or the conversation is not accepted, the screen calls `fetchDirectConversationMessages()` and renders the legacy Supabase text-message list.
- Request receiver sees accept/ignore actions and cannot compose until accepted.
- Request sender can send only the initial request message; after that the composer is disabled with a waiting note.
- Ignored and blocked states show disabled info cards and disable the composer.

### Message sending

- Stream accepted mode:
  - Text and optional attachment are sent through `sendViaStream()`.
  - Attachments are uploaded first with `channel.sendImage()` or `channel.sendFile()` and then included in `channel.sendMessage()`.
  - Quoted replies use `quoted_message_id` when possible, with a fallback send without quote if the quote send fails.
- Legacy mode:
  - Text goes through Supabase `send_direct_message` RPC.
  - The UI optimistically inserts a local message after send succeeds and then background reloads.
- Exchange-offer draft messages are custom Stream messages with `teswa_type: 'exchange_offer_draft'` and `teswa_*` fields for conversation, item, Dolab item, and note.

### Attachment handling

- Composer attachment selection is custom:
  - Images/videos use `expo-image-picker`.
  - Files use `expo-document-picker`.
  - Dolab shareables can insert text or a pending media/file attachment.
- Upload is manual:
  - Image -> `channel.sendImage(uri)` -> Stream `image` attachment using `image_url`.
  - Video/file -> `channel.sendFile(uri, fileName, mimeType)` -> Stream `video`/`file` attachment using `asset_url`.
  - Voice -> `expo-audio` recording -> `channel.sendFile(uri, voice-*.m4a, audio/m4a)` -> Stream `audio` attachment with duration.
- Rendering is custom:
  - Images show inline `Image` previews and a custom modal viewer.
  - Videos/files show custom cards; video playback uses `expo-video` behind a feature flag.
  - Audio uses a custom playback row and waveform/progress decoration.

### Reporting, blocking, message actions

- Conversation menu supports profile open, user report route, block/unblock through mobile block RPC helpers.
- Message long press opens an `AppActionSheet` with copy, reply, love, thumbs-up, save to Dolab, report, and delete.
- Report uses `reportDirectMessage()` with `conversationId`, Stream message id, reported user id, and a fixed reason.
- Delete uses `channel.deleteMessage()` and is only enabled for the current user's messages.
- Reactions currently only expose `love` and `thumbs_up` through the custom action sheet.

### Notification opening/actions

- Direct message push actions are registered in Expo categories, including text reply, like, and open chat.
- Current notification action resolution navigates to `/direct/{conversationId}` for direct open/reply/like. It does **not** currently send the reply text or like reaction in the background.
- Notification list opening also supports `/direct/` routes and marks notification rows as read.

### Loading / empty / error states

- No conversation id -> invalid conversation empty state.
- Initial load -> `بنجهز المحادثة...`.
- Missing conversation after initial load -> retry state.
- Stream not hydrated -> `بنجهز Direct Chat...`.
- Empty accepted Stream channel -> `ابدأوا الاتفاق` empty state.
- Empty legacy conversation -> `ابدأوا الكلام` empty state.
- Stream connection error -> error card plus retry.
- Send/media/viewer failures generally surface as action feedback cards or Arabic inline errors.

## Installed Stream package/capability audit

### Installed versions and dependency shape

- App dependency: `stream-chat-expo@^9.3.0-beta.4`.
- Lockfile resolves:
  - `stream-chat-expo@9.3.0-beta.4`.
  - `stream-chat-react-native-core@9.3.0-beta.4`.
  - `stream-chat@9.44.2`.
- `stream-chat-expo` declares peer support for `expo >=52`, `react-native >=0.76`, and optional Expo modules including `expo-audio`, `expo-document-picker`, `expo-file-system`, `expo-haptics`, `expo-image-manipulator`, `expo-image-picker`, `expo-media-library`, `expo-sharing`, and `expo-video`.
- The core package lists optional peer dependencies for `@op-engineering/op-sqlite`, `@shopify/flash-list`, `@react-native-community/netinfo`, gesture-handler, reanimated, safe-area, SVG, and teleport. Teswa already has many of these installed, but **does not have `@op-engineering/op-sqlite`**.
- The official React Native SDK docs list the v9 SDK as supporting rich media, reactions, threads/quoted replies, text input commands, image/file uploads, video playback, audio recording/voice messages, read state, typing indicators, channel/message lists, push notifications, SQLite offline storage, polls, reminders, drafts, and AI features.

### Capability matrix

| Capability | Available in Stream SDK? | Current Teswa implementation | Recommendation |
| --- | --- | --- | --- |
| `MessageList` | Yes. Must live under `Chat`/`Channel`; uses `FlatList` and can be customized with component overrides. | Custom `KeyboardAwareScrollView` mapping `streamMessages` and legacy messages. | **Do not migrate yet.** First isolate a message-row adapter/cache. Consider a lab-only `MessageList` proof with Teswa bubble overrides after parity tests. |
| `MessageComposer` / older `MessageInput` terminology | Yes. v9 uses `MessageComposer` with slots and `MessageInputContext`; docs and older examples still mention `MessageInput`. | Custom composer with plus sheet, voice button, reply card, exchange draft, Dolab draft/save, manual typing event. | **Keep custom composer next.** Later use SDK composer state/hooks only if custom `Input` can preserve Teswa layout/actions. |
| `AttachmentUploadPreviewList` | Yes, default preview stack inside `MessageComposer`; per-type preview overrides exist. | Custom `pendingAttachment` card and manual `sendImage`/`sendFile`. | Adopt upload manager/previews only in a lab. Production should first normalize attachment metadata and thumbnail generation. |
| Custom message UI | Yes via `WithComponents` overrides and custom attachment/message components. | Fully custom bubbles, offer-draft card, audio row, viewer. | Use Stream overrides only after deciding to render SDK `MessageList`; Teswa custom offer/audio/cards should remain app-owned. |
| Reactions | Yes. SDK and client support add/delete reactions and reaction UI customization. | Low-level `sendReaction` from action sheet; displays counts for `love` and `thumbs_up`. | Implement first through low-level Stream APIs and custom bottom sheet; migrate to SDK reaction picker only after design approval. |
| Typing indicator | Yes. SDK provides typing context/indicator; client events also available. | Manual `channel.keystroke()` throttle and `typing.start/stop` text. | Add a custom Teswa typing pill using existing events; SDK `TypingIndicator` only if `MessageList` migrates. |
| Message status/read states | Yes. SDK supports read state/status indicators. | Custom “اتبعثت/اتقرت” from `channel.state.read`. | Keep custom Arabic status text now; ensure read events trigger re-render. |
| Unread counts | Yes at channel/query level and SDK lists. | Supabase `unreadCount` from `get_my_direct_conversations`; direct screen marks read by RPC call. | Keep Supabase inbox count as source of truth until backend notification/inbox model is redesigned. Optionally sync Stream unread in background later. |
| Drafts | Yes, but must enable drafts in `MessageComposer` config and call create-draft APIs. | Dolab composer draft action saves text/attachment to Dolab; no auto-restore of typed text. | Do not adopt Stream drafts until composer migration. Implement a Teswa local draft cache first to preserve Dolab semantics. |
| Offline support | Yes, opt-in, but requires native SQLite support via `@op-engineering/op-sqlite`; docs say Expo requires dev client/custom native code. | No Stream offline; only loaded in-memory channel state and Dolab local data. | Do not enable yet. Build Teswa MMKV/SQLite snapshot cache for instant open; revisit Stream offline with dependency review. |
| Audio messages / recorder | Yes, Stream v9 includes audio recorder components and upload/playback support. | Custom `expo-audio` recorder/player with Stream file upload. | Keep custom implementation. It already matches Expo SDK 55 package choice and Teswa UI; consider SDK audio only after Android QA. |
| Push notification integration | Yes at Stream service/SDK level for APN/FCM; app currently uses Expo push and Supabase notification rows. | Expo notification categories and route resolution to Direct Chat. | Keep current push pipeline. Do not switch to Stream push until backend notification ownership is planned. |
| Custom attachments | Yes via type-specific overrides. | Custom `teswa_type` messages plus image/video/file/audio renderers and Dolab references. | Continue app-owned attachment schema with Stream-compatible fields; add custom renderer only if using SDK list. |

## Teswa custom UI vs Stream UI

### Should stay custom for Teswa identity

- Direct request lifecycle: requested/accepted/ignored/blocked gating, accept/ignore cards, waiting copy, composer disabled reasons.
- Arabic RTL bubble layout, copy, empty/error states, and Teswa tone.
- Conversation header, profile navigation, report/block actions, item context strip, and exchange-offer workflow.
- Dolab actions: save message to Dolab, save composer draft to Dolab, share from Dolab, save remote media metadata.
- Voice message visual design and playback controls until Stream audio behavior is verified on Expo SDK 55 Android.
- Fullscreen image/video/file viewer and any future media controls that need Teswa styling.

### Can be safely adopted from Stream incrementally

- Low-level channel state and WebSocket events.
- `sendMessage`, `sendReaction`, `deleteMessage`, `keystroke`, `stopTyping`, read state, and channel watch.
- Upload primitives (`sendImage`, `sendFile`) while keeping Teswa metadata normalization.
- Later, SDK `AttachmentUploadPreviewList` and upload manager in lab if it can preserve Dolab/Exchange composer actions.
- Later, `MessageList` only with custom message/attachment overrides and a screen-level wrapper that preserves current request/error/header/composer architecture.

### Should not be migrated yet

- Full production `MessageList` migration.
- Full production `MessageComposer` migration.
- Stream offline support.
- Stream push notification ownership.
- Stream ChannelList as the Direct inbox source of truth.
- SDK reaction picker if it forces non-Teswa visuals or conflicts with report/save/delete actions.

### Expo SDK 55 / Android risks

- `stream-chat-expo@9.3.0-beta.4` is beta and uses the v9 UI layer. Expect API/visual churn and test the Android back button, keyboard, gesture handler, bottom sheets, and audio recording carefully.
- The SDK bundles/depends on `@gorhom/bottom-sheet` through core, while Teswa also has `@gorhom/bottom-sheet@^5.2.14`. Duplicate/resolved versions can affect overlays/gestures if SDK UI components are mounted.
- Stream offline requires `@op-engineering/op-sqlite`, which is not installed and would require a native build/dependency review.
- Audio recording/playback is sensitive on Android with Expo SDK 55; keep `expo-audio` custom flow until recorder lifecycle, permissions, interruption, and background/foreground behavior are validated.
- Push actions with text input open the app; background reply/like execution is not implemented. Adding it requires secure token/client availability and failure UX.

## Specific answers

### Should Teswa migrate to Stream `MessageList` or keep the custom list?

**Keep the custom list for now.** The current list is deeply coupled to Teswa's direct request states, exchange-offer cards, Dolab actions, custom attachment rendering, Arabic read-state copy, and fallback legacy messages. A full migration to SDK `MessageList` should wait until:

1. Accepted Stream messages are cached locally for instant open.
2. Teswa custom message row and attachment renderers are extracted into reusable components.
3. A chat-lab screen proves `Chat` + `Channel` + `MessageList` + `WithComponents` can render exchange drafts, audio, reactions, and image/video/file cards with no regressions.
4. Android keyboard/gesture performance is verified.

### Should Teswa use Stream `MessageComposer` or keep the custom composer?

**Keep the custom composer for the next phase.** Stream `MessageComposer` is powerful, but Teswa's composer owns Dolab sharing/saving, exchange-offer drafting, custom voice flow, request gating, custom pending attachment card, and Arabic UX. The safe adoption path is:

1. Keep the UI custom.
2. Replace ad-hoc send/upload pieces with a small `directStreamSendMessage()` service wrapper.
3. Add local drafts and attachment metadata normalization.
4. Re-evaluate SDK `MessageComposer` only after a lab verifies that a custom `Input` can fully preserve Teswa actions.

### How should attachments be handled next?

1. Add a `DirectAttachment` domain type independent of Stream raw attachment shape.
2. Normalize inbound Stream attachments into `DirectAttachment` once during hydration.
3. Normalize outbound pending attachments before upload and send.
4. Keep using `channel.sendImage()` / `channel.sendFile()` for now.
5. Add video thumbnail metadata with `expo-video` (see below) before sending video messages.
6. Store remote URLs, MIME type, file size, duration, local preview URI, width/height where available, and `teswa_attachment_kind` metadata.
7. Add upload retry/error UI before turning on SDK upload previews.

### How should reactions be implemented?

1. Continue using Stream reaction APIs, but move logic to a service wrapper: `addDirectReaction(messageId, type)` and `removeDirectReaction(messageId, type)`.
2. Support toggle behavior by checking `ownReactions` before sending/deleting.
3. Keep allowed reactions small (`love`, `thumbs_up`, maybe `laugh`/`sad` later) and define them in a single constant.
4. Replace the long-press action sheet with a Teswa bottom-sheet reaction rail plus existing copy/reply/save/report/delete actions.
5. Do not adopt SDK reaction picker until visuals, RTL, and moderation/report actions can be preserved.

### How should typing indicators be added?

The low-level plumbing already exists. The next step is UI polish, not SDK migration:

1. Keep throttled `channel.keystroke()` on text changes.
2. Call `channel.stopTyping()` where available when the composer clears, sends, or blurs.
3. Render a small custom typing pill above the composer using existing `typing.start/stop` state.
4. Add a timeout safety clear (for example 4-6 seconds) in case `typing.stop` is missed.
5. If/when using SDK `MessageList`, replace this with the SDK `TypingIndicator` only if it matches the custom design.

### How should local cache be designed for instant open?

Create an app-owned cache before enabling Stream offline:

- Storage: use existing installed local storage (`react-native-mmkv` for fast metadata/small message snapshots, or existing `expo-sqlite` if message history becomes larger). Do not add dependencies in the first cache phase.
- Keying:
  - `direct:conversation:{conversationId}:metadata`
  - `direct:conversation:{conversationId}:messages:v1`
  - `direct:conversation:{conversationId}:draft:v1`
- Write points:
  - After `fetchDirectConversation()` succeeds, cache metadata.
  - After Stream hydration/events, cache the latest N normalized messages (for example 50-100) and channel read timestamp.
  - After legacy message load, cache legacy messages separately or mark source.
  - On composer text/attachment changes, cache an app-level draft.
- Read points:
  - On screen open, synchronously hydrate cached metadata/messages/draft before network fetch.
  - Mark cache snapshots with `source: 'stream' | 'legacy'`, `status`, `updatedAt`, and schema version.
- Invalidations:
  - Clear per user on sign out.
  - Drop cache when conversation status changes to blocked/ignored if messages should no longer be visible.
  - Keep Stream message ids as canonical ids; never invent ids except for local-only optimistic entries.

### How should video thumbnails be added using `expo-video`, not `expo-video-thumbnails`?

Do **not** add `expo-video-thumbnails`. With installed `expo-video`, the next implementation should:

1. Create a hidden/offscreen `VideoView` or reusable thumbnail component that loads the local/remote video source through `useVideoPlayer()`.
2. Wait for the player to be ready and seek to a safe timestamp (for example 0.5s-1s, or first playable frame).
3. Capture the rendered `VideoView` with the already installed `react-native-view-shot` to produce a local JPEG/PNG thumbnail URI.
4. Upload the thumbnail as an image/file through Stream, or include it as `thumb_url` after upload if Stream accepts the metadata path being used.
5. Cache generated thumbnails by video URI/hash to avoid repeated player startup.
6. Fall back to the current generic video card when capture fails, especially on Android devices/codecs.

This approach stays within installed dependencies (`expo-video` and `react-native-view-shot`) and avoids adding a deprecated or unavailable thumbnail package.

### How should fullscreen image viewer be implemented?

Keep a Teswa-owned fullscreen viewer:

1. Extract current modal viewer into `DirectMediaViewer`.
2. Use `expo-image` instead of React Native `Image` for caching/transition if desired; it is already installed.
3. Add pinch-to-zoom/double-tap zoom with `react-native-gesture-handler` + Reanimated only after the basic extraction is stable.
4. Keep save-to-Dolab/copy/open controls in the viewer.
5. Support swiping between multiple image attachments in the same message later.
6. Do not rely on Stream's fullscreen image viewer while offline docs note fullscreen image viewing has limitations in offline mode.

### Should context menu be native library, bottom sheet, or custom gesture UI?

Use a **Teswa bottom sheet** first.

- Native context-menu libraries add dependency/native risk and are not needed for the next phase.
- A bottom sheet matches the existing `AppActionSheet` pattern and allows Arabic labels, reporting, Dolab saving, reaction rail, and delete permissions in one place.
- Custom gesture UI can come later for reaction quick-pick, but should not replace the bottom sheet until accessibility, Android long-press behavior, and gesture conflicts are tested.

## Dependencies needed / not needed

### Needed now

No new packages are needed for the docs/audit PR or the next implementation phase if the plan keeps custom UI.

### Already installed and useful

- `stream-chat-expo` / bundled `stream-chat` for channel, messaging, upload, events, reactions.
- `expo-audio` for current voice implementation.
- `expo-image-picker`, `expo-document-picker` for current attachments.
- `expo-video` for video playback and future thumbnail capture source.
- `react-native-view-shot` for future video thumbnail capture.
- `react-native-mmkv` or `expo-sqlite` for app-owned local cache.
- `@gorhom/bottom-sheet` for existing action-sheet patterns.

### Not needed now

- `expo-video-thumbnails` — avoid; use `expo-video` + `react-native-view-shot` if thumbnails are implemented.
- Native context menu libraries — avoid until the bottom sheet approach proves insufficient.
- `@op-engineering/op-sqlite` — needed only if/when enabling Stream offline support; do not add in the next custom-cache phase.
- New push notification packages — current Expo notification routing should stay.

## Recommended implementation order

1. **No behavior change audit PR** (this document).
2. Extract Direct Chat domain types/helpers:
   - `DirectStreamMessage`
   - `DirectAttachment`
   - hydration mapper
   - send/upload service wrapper
3. Add app-owned instant-open cache:
   - metadata snapshot
   - recent messages snapshot
   - local draft snapshot
   - first-message performance metric with `cacheHit: true` when used
4. Improve accepted Stream mode without changing shell:
   - reaction toggle service
   - typing timeout/stopTyping polish
   - read-state event refresh
   - attachment error/retry state
5. Extract media viewer and attachment cards:
   - image fullscreen viewer
   - video card/player path with `expo-video`
   - file card actions
6. Add video thumbnails using `expo-video` + `react-native-view-shot` behind a feature flag.
7. Build chat-lab SDK UI proof:
   - `Chat` + `Channel` + `MessageList`
   - custom message/attachment overrides
   - no production route changes
8. Decide whether to migrate production `MessageList` based on lab parity/performance.
9. Build chat-lab composer proof with `MessageComposer` custom `Input` only after list decision.
10. Revisit Stream offline and Stream push only after native dependency/backend notification ownership review.

## Phased plan

### Phase 0 — Current audit (this PR)

- Document current behavior, SDK capability, risks, and migration recommendation.
- No runtime or UI behavior changes.

### Phase 1 — Stabilize custom Stream Direct Chat

- Extract mapping/services from `app/direct/[id].tsx` without changing UI.
- Add tests/type coverage where practical.
- Normalize attachment/message types.

### Phase 2 — Instant-open cache and drafts

- Add user-scoped local cache.
- Open from cache immediately, then reconcile from Supabase/Stream.
- Add local composer draft restoration while keeping Dolab draft action.

### Phase 3 — Media/reactions/typing polish

- Add bottom-sheet reaction rail and toggle logic.
- Add robust typing clear/stop behavior.
- Extract fullscreen image/video/file viewer.
- Add video thumbnails behind a flag.

### Phase 4 — SDK UI lab parity

- Build lab route using `MessageList` with Teswa custom renderers.
- Measure Android keyboard/scroll/long-press performance.
- Verify exchange cards, reactions, read states, attachments, and empty/error states.

### Phase 5 — Production migration decision

- If lab parity is high and Android risk is low, migrate `MessageList` first while keeping the custom composer.
- Only consider `MessageComposer` after message-list migration succeeds and custom `Input` proves it can preserve all Teswa actions.

## Open questions before implementation

- Should Supabase continue to own unread counts permanently, or should accepted Stream unread count eventually sync back to Supabase?
- Should direct notification reply/like actions execute in background or only navigate to the conversation?
- What is the retention limit for instant-open cached messages?
- Should blocked/ignored conversations hide cached message content immediately?
- Which reactions are approved for Teswa's brand and moderation posture?
- Should video thumbnails be generated only for local uploads, or also lazily for remote received videos?
