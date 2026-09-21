# TESWA REAL-DEVICE VISUAL CLOSURE 01 — DOLAB / ADD ITEM

**Date:** 2026-09-21  
**Status:** IMPLEMENTATION ACTIVE — DEVICE REVIEW NEXT  
**Branch:** `audit/native-product-reality-20260917`  
**Parent PR:** #526  
**Baseline on device:** Internal Testing v28 / 1.0.12

## Why this slice exists

Real-device review of v28 showed that MINE / Dolab was functionally present but visually still behaved like the exact anti-pattern rejected by the locked Dolab anchor:

`masthead → explanation → filter chips → generic section/card → repeated rows`

This slice does not invent a new product direction. It finishes the already-authorized direction in:

- `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `TESWA_ANCHOR_02_DOLAB_V1_2026-09-17.md`
- `TESWA_NATIVE_PHASE02_FINAL_HANDOFF_2026-09-18.md`

## Implemented closure

### Root Dolab
- compact private masthead;
- authored MINE mark retained;
- short real status summary instead of a permanent explanation paragraph;
- `حط حاجة` as the authored capture action;
- lifecycle filters changed from independent pills to a continuous rail;
- private collection now leads with object photography rather than list rows;
- first object receives the dominant shelf moment;
- following objects use smaller shelf snapshots;
- dense rows are reserved only for overflow;
- empty Dolab now uses an authored private shelf composition instead of a generic message card.

### Object-first capture
The old quick sheet:

`name + note → save`

is no longer the primary creation path.

The new path is:

`camera/gallery → object image → name → private note (optional) → Dolab`

The image is required for this primary real-device path.

Private quick notes are stored as Dolab notes, not as the listing description.

### Privacy boundary
Dolab description / memory is no longer copied automatically into the public Add Item description.

Public listing copy must be written explicitly in the publication flow.

This is a product honesty rule:

> private memory must not silently become public copy.

### Dolab item detail
- object portrait appears before metadata/forms;
- large media-first composition;
- state + media/note trace becomes a quiet rail;
- private note/description can surface as memory;
- the READY state now gets an authored publish threshold;
- the public transition remains the same durable object, not a visually unrelated listing.

### Add Item
The first publication step now begins with the object itself:

- large object image;
- additional images as subordinate snapshots;
- title after the image;
- category after identity;
- no form section visually outranks the object.

Publication summary no longer exposes internal English language such as `PRIVATE → POSSIBLE`.

### Post-publish continuity
The success state returns to Dolab.

The previous `جهّز حاجة تانية` reset path was removed because it allowed a second public listing flow to begin without a Dolab origin, contradicting the product law:

`MINE → POSSIBLE`

## Explicit non-goals for this slice
- BETWEEN US redesign;
- Deal room redesign;
- profile evidence redesign;
- broad Home redesign;
- server contract changes;
- versionCode 29 Play publication.

## Device gate

Do not call this slice visually closed until a real-device build confirms:

1. Dolab first viewport reads as a private collection, not a dashboard.
2. Lifecycle rail is readable and horizontally safe in Arabic.
3. Large and compact snapshots do not clip on the target phone.
4. Camera and gallery capture both land in the new object-first sheet.
5. A private note remains private after continuing to Add Item.
6. Add Item begins with the object image and preserves the same object identity.
7. Publish returns to Dolab and the original object reaches `في اللعب`.
8. No old name/note-only creation sheet is reachable from the root action.

## Release rule

v28 remains the installed baseline.

The first Play build carrying these real-device fixes must use **versionCode 29**.
