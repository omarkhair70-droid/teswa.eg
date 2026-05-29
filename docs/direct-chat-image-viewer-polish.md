# Direct Chat image viewer polish

## What changed

Direct Chat now uses a more polished fullscreen image viewer for image attachments.

The viewer keeps the existing modal path, but improves the visual treatment with:

- dark fullscreen overlay
- clearer close button
- visible image title/name
- loading state
- error state
- copy image URL action
- open externally action

## Scope

This change only touches the existing Direct Chat image viewer path.

It does not change:

- Stream connection logic
- Direct Chat cache
- video thumbnail generation
- message sending or upload behavior
- Supabase migrations
- Settings or Sentry
- package dependencies

## What stays intentionally simple

Pinch-to-zoom, swipe-to-dismiss, and gallery navigation are intentionally not implemented in this phase.

Those should be evaluated later with either a focused gesture implementation or a dedicated image viewer library after compatibility review.

## Manual QA

- Open an image attachment.
- Confirm the dark fullscreen overlay appears.
- Confirm the close button closes the viewer.
- Confirm tapping outside the image closes the viewer.
- Confirm copy URL shows toast feedback.
- Confirm open externally uses the system browser/viewer.
- Confirm image load failure shows the fallback error state.
- Confirm video and file viewer behavior still works.
