# TESWA ROOT MARKS + OBJECT MEMORY GRAMMAR V1

**Date:** 2026-09-17  
**Status:** AUTHORED VISUAL LANGUAGE — PRE-IMPLEMENTATION  
**Parent:** `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`

---

# 1. PURPOSE

The current native app has a strong utility-icon discipline but still gives Teswa-owned concepts to generic Material icons.

That is correct for utility, but wrong for identity.

Teswa must own a small set of marks that visually explain its four worlds and the movement of one object through them.

This file defines the authored mark family and the object-memory details that may repeat across the product.

The rule:

> **Utility remains native. Meaning becomes authored.**

Material Rounded remains the authority for back, settings, camera, gallery, mic, share, delete, archive, report, notifications, search, refresh, send and generic location.

Custom marks are reserved for concepts that only Teswa owns.

---

# 2. SHARED GEOMETRY

All Teswa marks must feel related without becoming four copies of the same icon.

Shared construction rules:

- base grid: 24 × 24 for navigation mark;
- larger editorial size: 48 / 64 / 96 using the same geometry;
- stroke-led, not filled mascot icons;
- rounded terminals;
- 1.8–2.2dp equivalent stroke at 24dp;
- one intentional opening / seam / crossing per mark;
- no tiny decorative detail that disappears below 24dp;
- asymmetry is allowed, but the center of visual mass must remain stable in bottom navigation;
- active state may introduce one filled clay/sage fragment, never a totally different icon;
- neutral state remains ink/outline compatible;
- marks must work in monochrome.

The family should feel closer to symbols drawn for one publication/product than an icon pack.

---

# 3. POSSIBLE — THE OPENING MARK

Meaning:

> A possession has crossed from private ownership into public possibility.

Geometry:

- one rounded rectangular boundary;
- one side is intentionally open;
- one smaller object-form partly crosses that opening;
- the inner form is offset vertically and horizontally;
- the object is clearly moving outward, not inward;
- no compass, eye, sparkle or search metaphor.

Large-expression use:

- Discover masthead;
- empty discovery art;
- publish success transition;
- launch/marketing diagrams.

Motion behavior:

- inner object begins behind/inside boundary;
- moves 4–8dp through the opening;
- boundary does not bounce;
- 220–320ms for passive transition;
- 420ms only on real publish threshold.

---

# 4. MINE / DOLAB — THE WARDROBE MARK

Meaning:

> These objects are still mine; this is where they are kept, prepared and remembered.

Geometry:

- tall rounded outer frame;
- one central vertical seam suggesting two doors;
- one short internal horizontal shelf;
- one tiny asymmetric handle/notch cue;
- never literal furniture perspective;
- never a cardboard-box/archive icon.

At 24dp it should read as a distinct cabinet/wardrobe symbol.

At larger sizes, the same geometry becomes layout:

- outer frame → private field boundary;
- shelf → section divider;
- doors → two-zone composition;
- one item may visually cross the frame when it moves `IN PLAY`.

Motion behavior:

- default: doors/seam quiet;
- when publishing: one object moves across/open past the right/leading boundary;
- when archiving: object recedes behind shelf/boundary;
- no skeuomorphic door-opening animation.

---

# 5. BETWEEN US — THE RELATION MARK

Meaning:

> Two independent possessions have become connected by one explicit relation.

Geometry:

- two small object nodes/forms;
- one soft bridge/thread/seam between them;
- bridge only exists because both sides exist;
- nodes remain visually distinct;
- no generic left-right arrows;
- no chat bubble as root identity;
- no chain-link cliché.

The relation line is the important part.

At larger scales this becomes the visual language for:

- offer pair;
- accepted offer;
- Deal header;
- completion evidence.

State behavior:

- pending: bridge is incomplete / lighter / segmented once;
- thinking: same bridge with quiet attention marker;
- accepted: bridge becomes continuous and stable;
- coordinating: bridge stays stable, items remain distinct;
- completed: bridge settles into an archival trace/stamp, not celebration.

This exact state grammar must be shared across Offer and Deal, not redrawn screen by screen.

---

# 6. ME / EVIDENCE — THE ARCHIVE IDENTITY MARK

Meaning:

> A person is understood through identity plus accumulated real outcomes.

Geometry:

- one soft portrait/identity frame;
- one small archival notch/stamp/trace attached to the frame;
- asymmetry communicates accumulation;
- not a generic bust/person outline alone;
- not a badge/shield icon pretending to be trust.

Large-expression use:

- My Profile masthead;
- evidence/history section;
- completed exchange archive.

The root mark should suggest: `person + trace`, not `account`.

---

# 7. PUT INTO PLAY — THE VISUAL VERB

This is the most important authored verb in the system.

Meaning:

> One object crosses from private boundary into public possibility.

Geometry:

- one small object form;
- one partial private frame;
- one visible crossing point;
- destination is open space, not another box.

Uses:

- `حط حاجة` authored action;
- publish review;
- publish confirmation;
- onboarding explanation;
- Dolab → Discover continuity;
- selected motion moments.

Do not use it for generic add/create actions outside object publication.

---

# 8. OBJECT MEMORY DETAILS

The nostalgia layer must be generated from real product context, never random decoration.

Allowed authored detail primitives:

## 8.1 Trace Label
A compact paper/photo label attached to an object moment.

May contain exactly one useful fact:

- area;
- date/time context;
- condition;
- distance;
- `من دولابي` / `في اللعب` where state context requires it.

Not a generic metadata-chip system.

## 8.2 Archive Number
Tiny optional visual numbering used only in private/history contexts.

Examples:

- item sequence in Dolab;
- completed exchange history;
- captured date-derived stamp.

Never expose database IDs.

## 8.3 Margin Mark
A fixed SVG underline, arrow, bracket or circle used to point to one human trace.

Examples:

- `مفتوح لـ...`;
- private note;
- story trace;
- completion evidence.

Marks are fixed assets; user text is never rendered in a handwritten font.

## 8.4 Photo Edge
A subtle light/paper edge used selectively for private snapshots or memory/evidence moments.

Not every public item image gets a polaroid frame.

## 8.5 Transfer Seam
A thin authored relation line used only when one object is crossing or binding to another state/person.

This seam is one of the core Teswa signatures.

---

# 9. WHAT MUST NEVER BECOME CUSTOM

Keep normal platform icons for routine actions.

Do not custom-draw:

- back;
- close;
- settings;
- share;
- camera;
- gallery;
- delete;
- report;
- mic;
- notifications;
- search;
- refresh;
- send;
- overflow.

The product must not become an illustrated control panel.

---

# 10. NAVIGATION USE

Bottom navigation uses the four authored root marks:

- POSSIBLE;
- MINE;
- BETWEEN US;
- ME / EVIDENCE.

Rules:

- labels remain visible in Arabic;
- mark alone never carries navigation meaning for accessibility;
- selected state uses restrained fill/weight change;
- no animated morph on every tab tap;
- selection response 120ms;
- a mark may animate meaningfully only when a real product state changes, not because the user switched tabs.

---

# 11. IMPLEMENTATION TARGET

When implementation begins, create one dedicated authored-mark layer, e.g.:

`ui/identity/TeswaMarks.kt`

or vector resources if more appropriate.

Do not replace `TeswaIcons.kt`; the two systems serve different jobs.

- `TeswaIcons` = utility/action semantics.
- `TeswaMarks` = Teswa-owned concepts.

The first implementation must include only the five marks above. No giant custom icon library.

---

# 12. SUCCESS TEST

If all text labels are hidden from a composed brand board, a viewer should still be able to notice one family:

- an opening;
- a private cabinet;
- two objects connected;
- a person with accumulated trace;
- an object crossing a boundary.

The marks should look like one visual thought about possession, movement and relation — not five clever unrelated icons.
