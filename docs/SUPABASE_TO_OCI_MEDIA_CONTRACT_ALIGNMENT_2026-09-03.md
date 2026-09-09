# Teswa Media Migration Contract Alignment

Date: 2026-09-03  
Lane 4 branch: `migration/supabase-to-oci-20260903`  
Lane 2 reference: `lib/backend/contracts/media.ts`

## Result

Lane 2's provider-neutral `MediaPurpose` contract already covers every live
Supabase Storage bucket one-for-one.

That means Lane 4 does not need to invent a new media taxonomy for OCI.

| Supabase source bucket | Lane 2 MediaPurpose | Source access |
| --- | --- | --- |
| `profile-images` | `profile_image` | public |
| `item-images` | `item_image` | public |
| `item-videos` | `item_video` | private |
| `story-media` | `story_media` | private |
| `direct-chat-media` | `direct_chat_media` | private |
| `direct-voice-messages` | `direct_voice` | private |
| `deal-voice-messages` | `deal_voice` | private |
| `contextual-voice-messages` | `contextual_voice` | private |
| `dolab-media` | `dolab_media` | private |

Machine-readable mapping:

`scripts/oci-migration/media-purpose-map.json`

## Audit watermark

At the Lane 4 audit snapshot:

- 9 buckets;
- 154 objects;
- 126,519,319 bytes.

These counts are a watermark, not a cutover constant. Re-capture immediately
before rehearsal and production cutover.

## Lane 3 physical target alignment

Lane 3 Phase 2 has now selected a single private application media bucket:

`teswa-media`

Lane 4 maps the nine logical Supabase buckets into that physical bucket using
prefix isolation:

- `profile-images/<source-key>`
- `item-images/<source-key>`
- `item-videos/<source-key>`
- `story-media/<source-key>`
- `direct-chat-media/<source-key>`
- `direct-voice-messages/<source-key>`
- `deal-voice-messages/<source-key>`
- `contextual-voice-messages/<source-key>`
- `dolab-media/<source-key>`

Machine map:

`scripts/oci-migration/oci-storage-bucket-map.phase2.json`

The physical bucket remains `NoPublicAccess`. Public product behavior for
`profile_image` and `item_image` is supplied through the Teswa media provider
contract/API rather than by weakening the physical bucket ACL.

This map is ready for execution only after Lane 3 actually applies and hands off
the `teswa-media` bucket.

## Ownership boundary

Lane 2 owns:

- `MediaStorageContract`;
- feature migration away from physical bucket names;
- Supabase media adapter;
- later OCI media adapter / provider selection.

Lane 3 owns:

- physical OCI Object Storage resources;
- networking/secrets/runtime used by the OCI media implementation.

Lane 4 owns:

- source object inventory;
- copy procedure;
- object-key preservation;
- source/target count/size/hash verification;
- target-only URL migration verification;
- rollback evidence.

## Important semantic rule

The source bucket's `public` flag is an input to product behavior, not a demand
that OCI use the same physical ACL design.

For example, OCI may use private physical buckets while the Teswa media adapter
provides the product-equivalent public URL behavior for `profile_image` and
`item_image`.

Parity is measured at the Teswa contract:

- upload succeeds/fails equivalently;
- object key ownership is preserved;
- remove behavior is equivalent;
- signed/private access is equivalent;
- public URL behavior is equivalent where the product currently requires it.

Do not weaken target access control merely to imitate a Supabase bucket flag.

## Public URL migration

Current database rows contain real Supabase public URLs.

Fresh read-only source check on 2026-09-03:

- `item_images.image_url`: 42 Supabase Storage URLs;
- `profiles.avatar_url`: 5 Supabase Storage URLs;
- `profiles.cover_url`: 1 Supabase Storage URL.

These source rows remain untouched.


Safe order:

1. copy object bytes with the same logical key;
2. verify key/count/size/hash parity;
3. make the OCI media adapter able to resolve the object;
4. rewrite public URL columns on the **OCI target only**, or provide a
   compatibility URL layer;
5. verify the application through `MediaStorageContract`;
6. leave Supabase source URLs untouched through the rollback window.

## B2 handoff relevance

Lane 2 has now **closed B2 client Storage isolation**.

Observed closure state:

- concrete Supabase Media adapter exists;
- profile images are behind `MediaStorageContract`;
- item images are behind `MediaStorageContract`;
- item videos are behind `MediaStorageContract`;
- Dolab media/signed URLs are behind `MediaStorageContract`;
- direct/contextual/deal voice media are behind `MediaStorageContract`;
- Direct Chat attachment Storage is behind `MediaStorageContract`;
- Stories Storage is behind `MediaStorageContract` with provider-neutral upload progress;
- feature/client direct `supabase.storage` allowlist is **0**;
- raw Story Supabase Storage REST/env exception is removed.

The current contract exposes migration-critical behavior:

- `getObjectKeyFromPublicUrl(purpose, url)`;
- `onProgress` with provider-neutral loaded/total/percent values;
- max-size enforcement and `file_too_large` semantics.

This is now a clean Lane 4 dependency: OCI media verification can target the
same contract without another feature-level Storage rewrite.

Lane 4 should therefore consume, not compete with, the B2 contract:

- no new physical bucket names in feature code;
- no OCI-specific URLs in screens/features;
- no source-bucket knowledge outside provider/migration layers.

As B2 continues, Lane 4 can attach the OCI object-copy/shadow verification to the
same nine logical purposes without another application-level rewrite.
