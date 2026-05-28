# Video thumbnail plan

Teswa should not add `expo-video-thumbnails`. Expo marks that package deprecated in favor of the `generateThumbnailsAsync` API from `expo-video`, which is already part of the project.

## Target surfaces

- Direct Chat video attachments and conversation previews.
- Dolab video cards and saved media previews.

## Intended approach

1. Keep video thumbnail generation close to the media surface that needs it, rather than adding a global migration now.
2. Use `generateThumbnailsAsync` from `expo-video` for local video assets when a still image is needed.
3. Cache generated thumbnail URIs through the existing local persistence/storage patterns for the relevant feature.
4. Fall back to a neutral video placeholder when generation fails or the source is remote and unavailable locally.
5. Add telemetry around generation failures before using thumbnails for ranking or delivery decisions.

## Out of scope for this foundation PR

- No Direct Chat behavior changes.
- No Dolab card redesign.
- No backend thumbnail service.
- No dependency on `expo-video-thumbnails`.
