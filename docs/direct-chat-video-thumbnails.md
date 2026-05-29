# Direct Chat video thumbnail cards

## Why `expo-video` is used

Direct Chat already depends on `expo-video` for in-app video playback. The thumbnail helper uses that same package through `createVideoPlayer()` and `VideoPlayer.generateThumbnailsAsync()` so accepted Stream Direct Chat can render video previews without expanding the native dependency surface.

The helper keeps thumbnail generation best-effort: it builds a temporary player for the remote video, asks `expo-video` for a small thumbnail, then releases the player immediately after generation succeeds or fails.

## Why `expo-video-thumbnails` is not added

No new package is installed for this work. Expo’s current guidance is to use `generateThumbnailsAsync()` from `expo-video` instead of adding `expo-video-thumbnails`, and `expo-video-thumbnails` is on a deprecation path. Keeping the implementation on `expo-video` avoids another native module, avoids dependency churn, and keeps Direct Chat aligned with the existing video viewer stack.

## Cache key strategy

Thumbnail cache keys are generated in `lib/media/video-thumbnails.ts` with a Direct Chat-specific prefix and a non-cryptographic hash. Callers pass stable attachment identity parts, currently the Stream message id, attachment index, and attachment title/name when present.

If no stable identity parts are available, the helper falls back to the video URL with query string and fragment removed before hashing. This prevents signed URL tokens or private session data from being written into the cache key.

`expo-video` thumbnails are native image references. When a platform exposes a local thumbnail URI on the generated object, the helper persists that URI plus dimensions in the existing offline JSON cache with a short TTL. When no URI is exposed, the helper still keeps the generated native image source in memory for the active chat session, but it does not attempt to serialize the native reference.

## Fallback behavior

Video thumbnail generation runs asynchronously after messages render. Direct Chat keeps showing the existing generic video/file card while the thumbnail is not ready. If thumbnail generation is unavailable, returns no thumbnail, throws, or exposes no usable source, the helper returns `null` and the chat remains on the existing fallback card.

Tapping either the generated thumbnail card or the fallback video card continues to open the existing Direct Chat media viewer/video viewer.

## Future improvements

- Add an explicit thumbnail URI export path if `expo-video` exposes a stable cross-platform file URI API in a future SDK.
- Prune or validate cached thumbnail files when the platform exposes enough metadata to detect stale cache entries safely.
- Prefer server-provided attachment thumbnails if Stream or the upload pipeline starts returning a trusted thumbnail URL.
- Add instrumentation for thumbnail generation success/failure rates once the UI has been manually QA’d on real devices.
