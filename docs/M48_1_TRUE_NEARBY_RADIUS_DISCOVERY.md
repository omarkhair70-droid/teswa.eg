# M48.1 True Nearby Radius Discovery

## Old behavior
Nearby discovery previously matched city/area text on the client from already-loaded browse items. It was not a real kilometer radius.

## What changed in M48.1
- Items now support optional precise coordinates (`location_latitude`, `location_longitude`).
- Discover nearby now uses a server-side 3 km radius RPC (`get_nearby_marketplace_items`) with Haversine distance.
- Nearby mode is paginated from server nearby results, not client filtering of first page.

## Why coordinates are only stored on explicit device-fill
Precise coordinates are saved only when the owner taps device location fill in Add Item. Manual city/area entry remains supported without precise coordinates.

## Why manual city/area edits clear coordinates
If user edits city or area after autofill in Add Item, stored lat/lng are cleared to prevent stale mismatched GPS from being published.
The same truth-preserving rule now applies in Edit Listing: changing city/area text clears stored precise coordinates.

## 3 km query behavior
- Input: user foreground one-time location from a fresh `getCurrentPositionAsync` lookup (not stale last-known fallback for this precision flow).
- Filters: active items, non-banned owners, non-null item coordinates.
- Distance: Haversine kilometers.
- Order: nearest first, then newer `created_at`.

## Old items with no coordinates
Historical items keep null coordinates and are intentionally excluded from strict nearby radius results. No backfill/faking from city text is done.

## Permission/location fallback
If permission is denied/unavailable, nearby mode is not activated; user continues normal browse flow with truthful copy and error messaging.

## Out of scope
- Maps UI/pins.
- Live tracking/background location.
- Continuous location updates.
- Exact address disclosure.
