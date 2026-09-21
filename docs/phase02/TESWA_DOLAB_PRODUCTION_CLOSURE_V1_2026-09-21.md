# TESWA DOLAB — PRODUCTION CLOSURE CONTRACT V1

**Date:** 2026-09-21  
**Status:** ACTIVE PRODUCT CLOSURE  
**Root destination:** MINE / دولابي  
**Baseline:** v30 real-device review  
**Next candidate:** versionCode 31 / 1.0.15

## Product definition

Dolab is not Saved Items, My Listings, a file manager, or a seller dashboard.

It is Teswa's private object world: the place where something is mine before it becomes possible between people.

The durable law is:

`OBJECT → MINE → POSSIBLE → BETWEEN US → EVIDENCE`

An object can carry private media, notes, voice and intent before publication. Publication is a boundary crossing, not a second unrelated object.

Standalone thoughts and things saved from Direct are valid private traces, but they are not fake objects and must never pollute the object shelf.

## Archaeology preserved

Across the Web/Expo/Native history, the useful Dolab instincts were:

- private personal space rather than inventory administration;
- object preparation before public listing;
- media + notes + voice living around the object;
- save from chat / bring from Dolab into chat;
- durable local/cloud ownership;
- publish handoff without losing identity;
- collections and organization as capability, not as top-level architecture the user must learn.

The old Expo implementation proved breadth, but exposed too much internal architecture: overview, inbox, drafts, media, notes, saved, collections and smart groups.

Native closure keeps the capability but removes the requirement that a normal person understand that architecture.

Rule:

> If a person has to understand Dolab's internal data model to use Dolab, the product has failed.

## Comparative research

### Pinterest boards
Useful lesson: a collection should be visually legible before it is administratively legible. Pinterest supports visual collection density, reordering and private/secret boards, but Dolab must not become an inspiration board.

Sources:
- https://create.pinterest.com/en-us/product-features/how-to-create-boards/
- https://help.pinterest.com/en/article/organize-your-boards

### Depop drafts / selling
Useful lesson: image-first capture, draft persistence and later publication reduce the cost of starting. Dolab goes further because the private object remains meaningful even if it is never published.

Source:
- https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item

### Vinted wardrobe pattern
Useful lesson: owned objects deserve strong visual prominence and lifecycle grouping. Teswa must avoid the seller-dashboard framing and keep the private/public boundary visible.

## Root screen contract

First viewport must communicate without explanation:

1. these are mine;
2. this is private;
3. objects can be unfinished;
4. state is lifecycle, not ecommerce filtering;
5. one object can cross into public possibility;
6. notes saved from conversations are traces, not listings.

Composition:

- compact MINE masthead;
- optional search only when useful;
- authored `حط حاجة`;
- lifecycle rail;
- private shelf composition led by photography;
- standalone private traces appear quietly under `على جنب`;
- no permanent explanatory hero card;
- no five pill filters;
- no giant placeholder cards for missing legacy media.

## Object shelf contract

The shelf is not a marketplace grid.

It uses bounded composition:

- one dominant object;
- up to two smaller snapshots;
- overflow can become denser rows;
- public owner/location chrome is forbidden;
- no-image legacy objects collapse rather than impersonating photography;
- READY is prepared-but-private;
- PUBLISHED receives a visible Put Into Play crossing cue;
- EXCHANGED becomes history, not deletion;
- ARCHIVED recedes without disappearing.

## Standalone traces contract

Private text/voice saved from Direct belongs in Dolab, but not as `dolab_items`.

New saves use nullable `dolab_notes.dolab_item_id` and nullable `dolab_media.dolab_item_id`, both already supported by the Oracle contract.

Text save:
`Direct message → standalone Dolab note`

Voice save:
`Direct voice → standalone Dolab media → voice note linked by media_id`

Legacy source=`note` items remain readable as compatibility traces but are removed from the object shelf.

This is a presentation/data-semantics correction, not destructive migration.

## Capture contract

Primary flow:

`camera/gallery → object → name → optional private trace → Dolab`

The object image is the first meaningful decision.

Keyboard must never cover the active field or commit action.

The private capture note remains private and must not silently become public description.

## Detail contract

Order:

1. quiet focused header;
2. large private object portrait/media;
3. title + state;
4. trace/history;
5. durable fields;
6. media and notes;
7. one next lifecycle action;
8. destructive removal last.

The detail may contain forms, but must never look like a settings page before it looks like the object.

## Publish crossing

`READY → حطّها في اللعب`

This is the signature MINE moment.

Before:
- private traces stay private;
- object remains inside Dolab.

After:
- same object is linked to the public item;
- state becomes `في اللعب`;
- Dolab retains the original identity/history;
- public copy is explicit, never copied from private memory by accident.

## Search and scale

Search is a utility, not a new root mode.

It matches:
- object title;
- description/private durable fields;
- category/condition/exchange intent;
- standalone private note body.

Lifecycle filtering still owns object state. Standalone traces only appear in `الكل`.

## Production gates

Dolab is not closed until all are green:

- root composition on a real phone;
- empty state;
- legacy no-media state;
- 1 / 2 / 5 / 20+ objects;
- lifecycle filters;
- Arabic RTL and long titles;
- search;
- object-first camera flow;
- object-first gallery flow;
- keyboard/IME;
- media upload progress/failure/retry;
- note/voice trace persistence;
- Direct → Dolab text save;
- Direct → Dolab voice save;
- Dolab → Direct shareable;
- private note does not leak public;
- READY → publish;
- publish reconciliation after network failure;
- published item returns to Dolab as same identity;
- archive/delete;
- offline/network/session-expired states;
- unit tests;
- debug/release Kotlin compile;
- release lint;
- APK/AAB;
- exact versioned Internal Testing;
- final real-device visual pass.

No next root surface gets called production-closed before this contract is satisfied.
