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
