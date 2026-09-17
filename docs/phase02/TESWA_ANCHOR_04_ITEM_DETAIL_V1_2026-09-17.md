# TESWA ANCHOR 04 — ITEM DETAIL V1

**Date:** 2026-09-17  
**Status:** SINGLE DIRECTION — DESIGN SPEC BEFORE IMPLEMENTATION  
**Parent authorities:**
- `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `TESWA_ROOT_MARKS_AND_OBJECT_MEMORY_GRAMMAR_V1_2026-09-17.md`
- `TESWA_ANCHOR_01_DISCOVER_HOME_V1_2026-09-17.md`

---

# 1. PURPOSE

Item Detail is where a glance becomes enough understanding to consider an offer.

It is not a product-detail ecommerce page.

It must answer, in this order:

1. what is this thing?;
2. who has it?;
3. what trace/past does it carry, if any?;
4. what is the owner open to?;
5. is this person/context credible enough?;
6. am I ready to connect one of my things to it?

The current native screen has the right data and action order, but still presents most of that meaning as stacked system sections.

V2 turns it into one authored object portrait.

---

# 2. ENTRY CONTINUITY

Item Detail must visually begin from the object the user just touched in Discover.

The image is the anchor.

Preferred transition:

- same item image expands from Discover object moment into the Detail media stage;
- title follows with restrained continuity;
- background remains warm paper;
- root chrome disappears;
- back gesture returns toward the originating object where architecture permits.

No whole-screen zoom as the primary visual story.

---

# 3. FIRST VIEWPORT

## LAYER A — MEDIA STAGE

The object fills the first meaningful area of the screen.

- first image large, 4:5 / adaptive based on source;
- no outer card;
- secondary images become a quiet strip/peek rather than a separate gallery block;
- share and report/edit are compact overlay/edge actions with native hit targets;
- one trace label may overlap media edge.

Possible trace label data:

- condition;
- area / distance;
- captured/publication context when available.

Do not overlay title, owner, category and state all over the image.

---

## LAYER B — OBJECT IDENTITY

Directly under media:

- title — strongest type after image;
- one meta line: condition · area;
- one compact state cue (`في اللعب`, `حاجتك`, unavailable, etc.);
- optional desire/open-to teaser.

Category is secondary and may appear as a small eyebrow or trace, not a permanent pill.

---

## LAYER C — HUMAN ANCHOR

Owner identity should feel attached to the object rather than another section card.

Composition:

- small avatar;
- owner name;
- area;
- one evidence fact relevant to deciding whether to offer;
- tap opens public profile.

Do not show a giant trust score.

---

# 4. `Mفتوح لإيه؟` AS A HUMAN TRACE

The desire field is one of the most important non-commerce distinctions in Teswa.

Do not render it as a generic info box.

Use one authored trace composition:

- small exchange-relation mark / margin underline;
- short label `مفتوح لـ...`;
- desire text in body type;
- sits close to the object/owner identity.

The visual should feel like a note attached to the possibility, not a product specification.

---

# 5. THE PAST / TRACE AREA

Optional human fields such as:

- item story;
- condition notes;
- swap reason;
- good-for context;

should not become four equal section headings.

Use progressive disclosure.

Recommended hierarchy:

## Primary trace
If `itemStory` exists, it may receive one authored memory block:

- quiet paper edge;
- tiny margin mark;
- max 3–5 visible lines before expansion;
- title may be `حكايتها` only when necessary.

## Practical condition
Condition notes remain direct and utilitarian.

## Why it is in play
Swap reason/good-for become compact supporting context near desire or behind `أكتر عن الحاجة` disclosure.

No forced sentiment when fields are empty.

---

# 6. THE OFFER THRESHOLD

The bottom action remains stable and native:

`قدّم عرض`

But the area immediately above it should preview the actual product law visually:

- compact authored relation mark;
- this object on one side;
- empty/MINE placeholder on the other;
- copy: `هتختار حاجة واحدة من دولابك`.

Tapping primary action enters Offer Compose where that empty side becomes selectable.

This makes the transition from possibility to relation legible before the user commits.

Do not show price, estimated value, fairness or cart language.

---

# 7. OWN ITEM VARIANT

When the item belongs to the current user, the page should not pretend it is an external possibility.

Changes:

- public preview remains image-led;
- owner block becomes quiet `دي حاجتك` identity;
- primary bottom action is management/contextual, not offer;
- edit/share/open-offers/archive actions follow existing contract;
- visual connection back to Dolab remains clear.

The object should feel like the same thing seen from the public side, not a different record.

---

# 8. SHARE AS PART OF THE OBJECT IDENTITY

Native sharing already exists and must remain.

The share action should feel like distributing one public possibility, not exporting a screenshot.

The generated share card should reuse:

- object image;
- title;
- one trace line;
- Teswa POSSIBLE mark;
- restrained brand treatment;
- canonical HTTPS URL in text payload.

The share card and Item Detail should visibly belong to the same visual system.

---

# 9. MISSING / UNAVAILABLE STATES

If object becomes reserved/unavailable/deleted while open:

- preserve the last known object identity when safe;
- state overlays/settles into the object stage;
- explain what changed;
- offer safe next route;
- do not erase everything into a generic error page.

If image is missing:

- use authored missing-object treatment from Visual Constitution;
- title and state remain meaningful.

---

# 10. MATERIAL / COLOR

Item Detail is primarily photographic.

- paper background;
- image does most visual work;
- clay enters at action/possibility threshold;
- sage supports evidence/trust;
- trace surfaces use muted warm paper;
- no gradient card around every section.

---

# 11. MOTION

Meaningful motion:

- Discover image → Detail media stage;
- secondary image selection;
- desire/trace expansion;
- offer threshold → ExchangePair formation;
- own item → edit/publish state continuity.

No decorative floating/pulsing UI.

---

# 12. ACCESSIBILITY / RTL

- title before meta in semantic order;
- owner identity reads as one grouped entity;
- trace decoration excluded from TalkBack when redundant;
- bottom commit action never hidden by IME/system bars;
- long Arabic title gets two lines before truncation;
- mixed Arabic/English model names remain readable;
- relation preview cannot rely on visual position alone to communicate requested/offered meaning.

---

# 13. IMPLEMENTATION PRIMITIVES

Potential authored primitives after anchor lock:

- `TeswaDetailMediaStage`
- `TeswaObjectTraceLabel`
- `TeswaOwnerAnchor`
- `TeswaDesireTrace`
- `TeswaMemoryBlock`
- `TeswaOfferThresholdPreview`

Do not implement until the anchor family is complete.

---

# 14. WHAT THIS SCREEN MUST NOT BECOME

Reject if it becomes:

- Amazon/ecommerce PDP;
- image + six cards + sticky button;
- social post with likes/comments dominating;
- scrapbook collage;
- giant biography of the object;
- generic Material detail screen with new colors;
- price-less marketplace page that still looks like checkout.

---

# 15. SUCCESS TEST

Without reading every line, a viewer should understand:

1. one real object is the protagonist;
2. a real person owns it;
3. the object may carry a past/context;
4. it is open to a next possibility;
5. offering means connecting one of my objects to it;
6. the screen clearly belongs to the same authored world as Discover and Dolab.
