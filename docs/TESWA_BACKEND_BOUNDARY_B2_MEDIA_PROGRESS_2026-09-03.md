# Teswa Backend Boundary — B2 Media / Storage Progress

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Slice B2.1 — Media adapter + Dolab signed URLs

Implemented:

- concrete `createSupabaseMediaStorageAdapter()`;
- logical `MediaPurpose -> provider bucket` mapping inside the adapter;
- `teswaBackendRuntime.media`;
- upload/remove/signed URL/public URL provider primitives behind `MediaStorageContract`;
- migrated `lib/dolab/signed-urls.ts` off direct Supabase Storage calls.

The physical bucket name `dolab-media` is now adapter-private for this migrated path.

Direct Supabase client imports ratchet **55 -> 54**.

## Deliberately deferred

- Story upload progress uses a raw Storage REST path and requires a progress-preserving adapter path.
- Profile image mutation mixes Storage and profile DB update/rollback and will be migrated with rollback parity.
- Item video upload mixes Storage and item video DB metadata.
- Direct Chat media combines Storage, RPCs and Realtime.

No production provider switch was made.


## Slice B2.2 — Profile image Storage boundary

Migrated all Storage concerns in `lib/profile-images.ts` behind `MediaStorageContract`:

- upload;
- public URL creation;
- rollback cleanup after profile-row save failure;
- previous-object cleanup;
- current-object cleanup on image removal;
- provider-specific public URL -> object key parsing.

The feature no longer contains:

- `supabase.storage`;
- the `profile-images` bucket name;
- Supabase public Storage URL markers.

The remaining direct Supabase dependency in this file is the `profiles` DB mutation and is reassigned to the future Profile adapter lane.

### Storage ratchet

The boundary checker now freezes direct Supabase Storage access to the current legacy set only.

Current SDK Storage legacy files: **11**

Any new `supabase.storage` access outside the Supabase adapter is rejected, and stale Storage allowlist entries fail validation after migration.


## Slice B2.3 — Item video Storage boundary

Migrated item-video Storage operations behind `MediaStorageContract`:

- `lib/item-videos.ts` upload;
- item-video signed URL generation and cache refresh;
- item-video cleanup in `lib/publish-item.ts` rollback paths.

Removed feature knowledge of the physical `item-videos` bucket.

`lib/item-videos.ts` still reads the `item_videos` DB row through Supabase and therefore remains a Marketplace-domain migration candidate, but it no longer owns Storage transport.

Direct SDK Storage legacy files ratchet **11 -> 10**.


## Slice B2.4 — Dolab upload / delete Storage boundary

Completed Dolab Storage decoupling:

- `uploadDolabPendingMedia` uses `MediaStorageContract.upload`;
- failed DB-row save rollback uses `MediaStorageContract.remove`;
- `deleteDolabMedia` Storage cleanup uses `MediaStorageContract.remove`;
- empty-file detection is enforced inside the media adapter before upload.

Removed from Dolab feature code:

- `supabase.storage`;
- the physical `dolab-media` bucket name;
- local file-to-buffer transport logic that belonged to the provider adapter.

Dolab modules still use Supabase for their database rows and remain a later remaining-domain migration concern.

Direct SDK Storage legacy files ratchet **10 -> 8**.


## Slice B2.5 — Item image Storage boundary

Removed direct item-image Storage coupling from:

- `lib/publish-item.ts`;
- `lib/edit-listing-images.ts`;
- `lib/listing-lifecycle.ts`.

Migrated through `MediaStorageContract`:

- new item image uploads;
- public URL creation;
- publish rollback cleanup;
- edit-image upload rollback;
- removed-image cleanup;
- archived-listing final image cleanup;
- provider public URL -> object-key parsing.

The three feature modules no longer contain:

- `supabase.storage`;
- the physical `item-images` bucket name;
- Supabase public Storage URL markers.

Their existing DB/RPC responsibilities remain unchanged for later Marketplace-domain migration.

Direct SDK Storage legacy files ratchet **8 -> 5**.
