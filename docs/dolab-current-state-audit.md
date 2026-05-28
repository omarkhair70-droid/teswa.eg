# Dolab Current State Audit (Existing System Only)

Date: 2026-05-28
Scope: Current implementation only (no proposed code changes in this audit).

## 1) Current Dolab screens/routes

- `app/dolab/index.tsx` is the main Dolab screen and appears to be the single dedicated Dolab route (`/dolab`).
- Entry points into `/dolab` currently exist in:
  - Profile tab shortcut card (`app/(tabs)/profile.tsx`)
  - Home hub quick action (`app/(tabs)/home.tsx`)
- Related screens/flows connected to Dolab behavior:
  - Add Item tab handoff from Dolab (`app/(tabs)/add.tsx`) when route params include `source=dolab` and `dolabItemId`.
  - Direct chat screen (`app/direct/[id].tsx`) for “save to dolab”, “draft to dolab”, and “choose from my dolab” actions.

## 2) Current data source/tables

### Server-side (Supabase)

Defined by migration `supabase/migrations/20260524120000_dolab_foundation.sql`:

- `public.dolab_items`
  - Core draft/publish staging object (title, description, category, condition, status, source, optional link to published `items.id`).
  - Status values: `draft | ready | published | exchanged | archived`.
  - Source values: `manual | camera | gallery | share_intent | note | voice`.
- `public.dolab_media`
  - Media records linked to Dolab item (optional), supports `image | video | audio`.
- `public.dolab_notes`
  - Notes/self-chat records, optional links to Dolab item and media.
  - Note types: `text | voice | idea | checklist`.
- Storage bucket: `dolab-media` (private), with RLS policies for per-user path ownership.

### App data access layer

- Primary Dolab DB CRUD and snapshot functions are in `lib/dolab/index.ts`.
  - Fetch: `fetchDolabItems`, `fetchDolabMedia`, `fetchDolabNotes`, `fetchDolabRemoteSnapshot`
  - Save/update: `saveDolabDraftItem`, `updateDolabDraftItem`, `updateDolabSavedItem`, `saveDolabSelfNote`
  - Delete: `deleteDolabItem`, `deleteDolabMedia`, `deleteDolabNote`
  - Publish handoff helpers: `fetchDolabPublishSource`, `markDolabItemPublished`

### Local-only Dolab bridge data (chat integration)

- Direct-chat Dolab bridge (`lib/dolab/chat-bridge.ts`) writes to local Dolab persistence (self messages + pending media), not directly to Supabase.
- This means some “save to dolab” actions are immediate local saves first and rely on Dolab screen sync/upload flows for eventual remote persistence.

## 3) What Dolab currently shows

From `app/dolab/index.tsx` + Dolab components:

- A multi-shelf Dolab experience (overview + shelf-specific views), including:
  - Notes/self-chat shelf
  - Media shelf
  - Drafts/ready shelf
  - Inbox shelf
  - “Issues” filter/state and collection/grouping affordances
- Saved library section/cards for media previews.
- Self-chat panel with message types (`text`, `idea`, `checklist`, voice placeholder).
- Inbox conversion controls (convert inbox content to note/media/start draft).
- Share/publish bridge sheets (conversation picker, share bridge, publish bridge).

## 4) What actions already work

### Core Dolab
- Create/update Dolab draft item via `dolab_items`.
- Save Dolab self-note via `dolab_notes`.
- Upload/save Dolab media rows + storage objects (`dolab_media` + `dolab-media` bucket).
- Delete item/note/media (including storage cleanup attempt for media).
- Assign/publish flow to Add Item tab:
  - Dolab routes to `/ (tabs)/add` with `dolabItemId`.
  - Add tab imports Dolab fields/media and can mark source Dolab item as `published` after successful publish.

### Profile / navigation
- Profile tab “دولابي” shortcut opens `/dolab`.
- Home hub “دولابي” quick action opens `/dolab`.

### Direct chat ↔ Dolab
- Message action: “احفظ في الدولاب” calls `saveDirectMessageToDolab`.
- Composer action: “مسودة في الدولاب” calls `saveComposerDraftToDolab`.
- Exchange draft cards include “احفظ في الدولاب”.
- File viewer modal includes “حفظ في الدولاب”.
- “من دولابي” selector can load recent locally saved Dolab shareables when available.

## 5) What actions are fake/placeholder

- In Direct chat, the “من دولابي” sheet falls back to disabled placeholder action when no shareables are loaded:
  - Label: “اختيار حاجة من دولابك جاي قريبًا.”
- In `saveComposerDraftToDolab`, file-only attachment save is explicitly not implemented:
  - Returns message “حفظ الملفات في الدولاب جاي قريبًا.” unless text is also saved.
- Dolab self-chat uses `voice_placeholder` message type for voice-note placeholder behavior (not a full persisted voice-note message object by itself).
- Some Dolab cards are pressable with no-op handlers (e.g., share status card `onPress={() => {}}`) indicating display-only status in that UI location.

## 6) What is missing

Based strictly on existing implementation surface:

- No separate dedicated “wardrobe/my items/saved items” route set beyond current `/dolab` + internal shelf modes; these concepts are represented inside Dolab and/or existing item management routes, not standalone Dolab sub-routes.
- Direct chat “choose from my dolab” does not query remote Supabase Dolab library; it currently reads limited local shareables from local persistence bridge.
- File-type attachment saving to Dolab is incomplete in composer-only file path (explicit “coming soon”).
- No evidence of additional offer/deal-specific server-side Dolab table linkage beyond message metadata fields (e.g., `teswa_dolab_item_id`) and generic save-to-dolab message actions.

## 7) Recommended Dolab 2.0 plan (build on existing Dolab, not replace)

1. **Keep `/dolab` as the single product surface** and evolve shelves incrementally (no route reset).
2. **Unify save pathways into one persistence contract**:
   - Keep current local-first bridge for speed, but add deterministic background promotion to Supabase for all supported media/text paths.
3. **Close placeholder gaps first**:
   - Implement file-only Dolab save parity (composer/direct viewer) using existing `dolab_media` model extension path.
4. **Promote “choose from my dolab” from local-only to hybrid**:
   - Start with local cache + remote fallback from `dolab_items`/`dolab_media`/`dolab_notes` to maintain speed and completeness.
5. **Strengthen offer/deal linkage without schema replacement**:
   - Continue using existing message metadata (`teswa_dolab_item_id`) and add consistent read/write hooks from existing flows before introducing new models.
6. **Add operational observability around existing flows**:
   - Track save success/failure by path (direct message action, composer draft, exchange draft, publish handoff) and reconcile failures using current retryable upload model.

---

This audit intentionally documents current state and extension direction only; it does not propose replacing current Dolab architecture.

## 8) Dolab 2.0 gap closures in this PR

- Direct Chat save actions now build on the existing Dolab model instead of returning placeholder success:
  - Text saves continue to write the local self-message bridge first and are also promoted to `public.dolab_notes` when an authenticated Supabase user is available.
  - Supported media/file attachments are converted into existing pending Dolab media entries and, when possible, promoted through `public.dolab_items`, `public.dolab_media`, and the `dolab-media` bucket.
  - Generic remote file links that cannot fit `dolab_media.media_type` are persisted as existing Dolab draft/note metadata rather than pretending to upload a binary file.
- The Direct composer file-only path no longer returns “حفظ الملفات في الدولاب جاي قريبًا.” for supported input. It either saves to existing Dolab persistence or returns the unsupported/failure copy.
- The “من دولابي” selector remains local-first for speed, but now falls back to the remote Dolab snapshot (`dolab_items`, `dolab_media`, `dolab_notes`) when the local bridge is empty.
- Exchange draft card saves and file viewer saves use the same Direct Chat save-to-Dolab bridge as message actions, so they now share the same persistence, duplicate, unsupported, and failure behavior.

## 9) Local-first vs remote-backed behavior after this PR

- Still local-first:
  - Direct Chat text notes and pending media are written to the existing local Dolab bridge immediately so the chat UI is fast and Dolab can still work during temporary remote failures.
  - The selector reads local notes/media first and only queries Supabase when local shareables are empty.
- Now remote-backed:
  - Authenticated text saves are promoted to `dolab_notes`.
  - Supported image/video/audio attachment saves attempt a `dolab_items` draft plus `dolab_media` row and `dolab-media` upload.
  - The selector can show remote notes, signed remote media, and item title/description shareables when the local bridge has nothing.

## 10) Supported file behavior

- Supported binary media types through existing `dolab_media.media_type` values:
  - Images: MIME `image/*` or common image extensions (`jpg`, `jpeg`, `png`, `webp`, `gif`, `heic`).
  - Videos: MIME `video/*` or common video extensions (`mp4`, `mov`, `m4v`, `webm`).
  - Audio: MIME `audio/*` or common audio extensions (`m4a`, `mp3`, `aac`, `wav`, `ogg`).
- Supported metadata-only file saves:
  - Remote `http`/`https` file URLs with safe metadata (name/title, MIME type, size, URL) are saved as an existing Dolab draft/note record when the binary type is not representable in `dolab_media`.
- Explicitly unsupported:
  - Local-only generic files that are not image/video/audio and cannot be represented in the current Dolab schema are rejected with “نوع الملف ده لسه مش مدعوم في الدولاب.”

## 11) Future work that remains

- Add a first-class generic document/file representation only if the product chooses to extend the existing schema in a future migration.
- Add remote duplicate detection across `dolab_notes`/`dolab_media`; this PR only performs deterministic local duplicate checks before saving.
- Add richer picker UI for filtering remote Dolab shelves; this PR only upgrades the existing Direct Chat action sheet fallback.
- Add analytics/observability around path-specific Dolab save failures and remote-promotion retries.
