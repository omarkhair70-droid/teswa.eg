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
