# Direct Chat local message cache plan

## Scope

This cache is an app-owned, lightweight instant-open snapshot for **accepted Stream Direct Chat conversations only**. Requested, ignored, blocked, and non-Stream legacy direct chat flows keep their existing Supabase message loading behavior.

## Cache storage and key

- Storage backend: `react-native-mmkv`, using the MMKV instance id `teswa-direct-message-cache`.
- Snapshot key prefix: `direct-chat:stream:v1:`.
- Per-conversation key format: `direct-chat:stream:v1:<conversationId>`.
- Index key: `direct-chat:stream:v1:index`, used only to prune older conversation snapshots.

The cache is intentionally separate from Supabase auth/session storage and does not share auth keys.

## Stored fields

Each snapshot stores only the small render-safe fields needed to draw the existing custom Teswa message UI before Stream hydration finishes:

- `id`
- `createdAt`
- `text`
- `userId`
- `userName`
- `userAvatar`, when already present on the rendered Stream user payload
- `attachments` render metadata:
  - `type`
  - `title`
  - `name`
  - `assetUrl`
  - `imageUrl`
  - `thumbUrl`
  - `mimeType`
  - `fileSize`
  - `durationSeconds`
- `reactionCounts`
- `ownReactions`
- `quotedMessage` preview fields needed by the current bubble renderer
- Teswa custom card fields already used by Direct Chat:
  - `teswaType`
  - `offerNote`
  - `teswaConversationId`
  - `teswaItemId`
  - `teswaDolabItemId`

## Privacy notes

The cache must not store Stream tokens, Supabase auth tokens, refresh tokens, private session state, or any credential-like values. It is a small UX cache of recent accepted conversation render data only. Message text is cached because it is required to render the instant-open message list; telemetry must never include message text, attachment URLs, or user-generated content.

## Invalidation and pruning rules

- Keep the latest 50 messages per conversation snapshot.
- Keep up to 50 conversation snapshots in the MMKV index.
- Expire snapshots after 14 days.
- When Stream hydration succeeds, replace the cached/stale snapshot with the current live Stream message list.
- When the live Stream message list is empty, remove that conversation snapshot.
- Pruning runs after cache writes and removes expired or over-limit snapshots from the index.

## Runtime behavior

1. Open a direct conversation and fetch its conversation metadata.
2. If the conversation is accepted and Stream Direct Chat is enabled, skip legacy Supabase message loading.
3. Read the local snapshot for the conversation and render it immediately if present.
4. Connect to Stream and run `channel.watch()` in the background.
5. Replace cached/stale messages with live Stream state after hydration.
6. Keep showing cached messages plus a retry/error card if Stream fails while a snapshot exists.
7. Preserve the existing loading state when no snapshot exists.

Background metadata refreshes, such as focus-triggered `load({ background: true })`, must not re-apply cached snapshots after live Stream state is already displayed. Cached snapshots are only for instant-open bootstrapping; live Stream messages remain the source of truth once hydration has started or completed.

## Future migration path

This cache is a bridge toward stronger offline support, not a replacement for Stream offline. The next migration step can keep this key/version stable long enough to measure cache-hit value, then introduce Stream offline storage behind a feature flag. Once Stream offline is verified for accepted Direct Chat, this MMKV snapshot can be reduced to a fallback/boot cache or pruned with a new key version such as `direct-chat:stream:v2:`.
