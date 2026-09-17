# TESWA ANCHOR 01 — DISCOVER HOME V1

**Date:** 2026-09-17  
**Status:** SINGLE DIRECTION — DESIGN SPEC BEFORE IMPLEMENTATION  
**Parent authority:** `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`

---

# 1. PURPOSE

Discover is not a marketplace home page.

It is the first public moment where a private possession has become a possibility.

The screen must communicate immediately:

1. these are real things owned by real people;
2. they are open to exchange;
3. Teswa is visually authored, not a generic catalog;
4. the user can still search, understand distance and act without learning a decorative interface.

No explanatory paragraph should consume the first viewport.

The content itself explains Teswa.

---

# 2. FIRST VIEWPORT

Target phone reference: ~390–430dp width.

The first viewport has only four visual layers:

## LAYER A — QUIET TESWA HEADER

Height: compact.

RTL composition:

- authored `POSSIBLE` mark at the start of the identity cluster;
- small `اكتشف` title;
- search action;
- notifications action.

No large 30dp screen heading.
No subtitle paragraph.
No filter row under the title.

The header should feel more like the masthead of a small publication than an Android settings page, while still using normal native hit targets.

### POSSIBLE mark — V1 geometry

A compact aperture/reveal symbol:

- rounded outer frame, open on one edge;
- one smaller object-like form partially crossing that opening;
- the inner form is offset, not centered;
- no compass needle;
- no sparkle;
- no eye symbol.

Meaning: something that belonged inside has become visible outside.

At 24dp it must still read as a simple mark.

---

## LAYER B — HERO OBJECT MOMENT

The first available item enters immediately beneath the header.

It is **not inside a card**.

### Media

- width: screen width minus normal outer inset;
- preferred aspect ratio: 4:5 portrait;
- radius: authored large object radius, but not floating-card shadow;
- image may extend 4–6dp outside the text alignment on one side to break the strict column;
- no gradient container around the whole object block.

### One physical-feeling trace

A small data-backed label may overlap the lower image edge by ~10–14dp.

Examples when data exists:

- `BENI SUEF · 2 KM`
- `الروضة · النهارده`
- condition label.

This is an **archive/photo label**, not a pill collection.

Only one trace label on the hero image.

### Under media

Order:

1. item title — large enough to feel editorial, max 2 lines;
2. owner + area on one quiet line;
3. one useful condition/desire clue;
4. optional short item-story trace, max 2 lines, only when present.

Do not show category + condition + city + owner as four chips.

### Authored micro-mark

If desire/open-to text exists, one fixed Teswa SVG underline/arrow mark may visually point into it.

The mark is decorative/semantic and has no accessibility responsibility.

---

## LAYER C — CONTEXT INTERRUPTION / STORIES

Stories do not appear as an Instagram clone immediately at the top.

They appear **after the first real object** so Teswa's purpose is established first.

Working label:

`من عند الناس`

### Visual form

Use a short horizontal strip of **photo fragments / postcards**, not circular avatars only.

Each story tile:

- 72–92dp wide;
- 100–126dp high;
- image dominates;
- tiny avatar/name anchor;
- optional object/entity anchor if the story relates to one;
- no heavy border;
- current user's create tile may use the custom `Put Into Play / Add Trace` mark rather than a generic `+` circle.

The strip should look like small found snapshots laid next to the main object, while remaining horizontally scrollable and fully accessible.

Story media still opens the existing Story viewer and preserves contextual replies.

---

## LAYER D — SECONDARY OBJECT CLUSTER

After stories, do not repeat another identical 4:5 hero.

Use a controlled **two-object cluster**:

- one object ~58% width;
- one object ~38% width;
- heights intentionally different;
- shared baseline is not required;
- titles live directly below each image;
- metadata limited to one line each.

This introduces the editorial/asymmetric rhythm without sacrificing tappability.

On very narrow width or large font scale, collapse to one-column objects.

---

# 3. DISCOVERY RHYTHM

Use finite authored templates rather than a random masonry grid.

Recommended repeating sequence:

`HERO → STORY TRACE → DUO → FULL → NEARBY → DUO → FULL`

where:

### HERO
4:5 large object, richest context.

### DUO
Two object moments with unequal dimensions.

### FULL
A wide/large object moment with reduced metadata.

### NEARBY
A practical local-context interruption.

The feed algorithm chooses data; the presentation chooses the next safe template.

No item is made semantically more valuable only because it received the hero slot. Hero is presentation rhythm, not ranking truth beyond whatever feed ordering already exists.

---

# 4. NEARBY LENS

The current top-level `الأقرب لي` ChoiceChip should not be the dominant discovery personality.

Nearby remains easy to reach, but becomes a contextual lens.

## Entry

In the header/upper discovery area, use a quiet location affordance:

`بني سويف` + location icon + small dropdown/chevron behavior.

When precise/coarse nearby has not been enabled, tapping opens the existing permission path.

## Inline nearby block

When location is active, insert an authored block between object moments:

Eyebrow:
`قريب منك`

Body:
`حاجات ممكن يبقى الوصول ليها أسهل.`

Then show 1–3 nearby objects with distance visible.

No gamified city pulse.
No map unless user explicitly opens a map/lens where it improves choice.

---

# 5. OBJECT MOMENT COMPONENT

New primitive target:

`TeswaObjectMoment`

This is **not** one reusable layout with parameters for everything.

It has a bounded variant enum:

- `Hero`
- `Full`
- `CompactPortrait`
- `CompactSquare`

Shared contracts:

- one item identity;
- image or authored missing-image state;
- title;
- max one primary meta line;
- optional trace;
- tap opens exact item;
- shared transition identity uses stable item ID.

Variants change composition, not semantics.

---

# 6. CUSTOM MISSING-IMAGE STATE

The current generic image placeholder is replaced in authored object moments.

Working visual:

- warm archive-paper field;
- custom simple outline of an object label/photo corner;
- item title still visible;
- tiny fixed mark: `الصورة مش موجودة` only if needed;
- category may inform a small vector glyph, but do not build a giant category illustration library yet.

The empty image state must look intentional in a portfolio screenshot.

---

# 7. IMAGE / MATERIAL DETAILS

## Photo edge

Do not put every image on white rounded cards.

Use the image itself as the surface.

## Border

Default: none or hairline based on contrast.

## Shadow

None on ordinary feed media.

## Paper labels

Use `surface / muted field` with one thin outline or no outline depending contrast.

## Texture

No global grain in V1 implementation.

If texture is introduced later, it must be a low-opacity authored asset on non-interactive paper surfaces only.

---

# 8. TYPOGRAPHY ON DISCOVER

The screen title becomes quieter than the object title.

Suggested hierarchy:

- root masthead `اكتشف`: titleMedium / semibold;
- hero object: headlineSmall or custom ~24–26sp Arabic-safe;
- owner/meta: bodyMedium;
- archival label: labelSmall/Medium;
- story name: labelSmall;
- duo object title: titleSmall/Medium.

The product should feel image-led, not heading-led.

---

# 9. MICROCOPY

Remove:

`حاجات أصحابها حطّوها في اللعب وفتحوها لاحتمال جديد.`

from the permanent top viewport.

That idea should be understood through composition.

Keep user-facing language short:

- `اكتشف`
- `قريب منك`
- `من عند الناس`
- `مفتوح لـ…`
- `عند <name>`

When loading more, prefer a quiet progress state rather than a full-width primary button if automatic pagination is technically safe. If explicit pagination remains necessary, the action should not visually compete with item moments.

---

# 10. MOTION INTO ITEM DETAIL

This anchor must establish the first real lifecycle continuity.

On item tap:

- image bounds transition into Item Detail media stage where supported;
- title/context follows with restrained fade/position continuity;
- no whole-screen scale-in as the primary effect;
- predictive back returns toward the originating object.

Fallback without shared transition:

- 220–320ms image-aware fade/expand;
- state remains clear with animation scale disabled.

---

# 11. ACCESSIBILITY / RTL

- RTL controls and reading order remain semantic.
- Object title is read before supporting owner/meta.
- Decorative archive labels do not duplicate spoken content unnecessarily.
- Story tile minimum hit target wraps the visual card even if the photo is narrow.
- Duo layout collapses under large font scale rather than squeezing Arabic.
- No custom mark carries meaning without adjacent accessible label at first use.

---

# 12. WHAT THIS SCREEN MUST NOT BECOME

Reject implementation if it becomes:

- Pinterest masonry;
- Instagram Stories + marketplace cards;
- Depop clone;
- giant retro scrapbook;
- Material list with new SVG icons;
- hero banner followed by identical cards;
- permanent explanatory onboarding screen;
- gradient soup.

The authored feeling comes from **object hierarchy, rhythm, trace and continuity**.

---

# 13. DEFINITION OF SUCCESS

A screenshot of the first 1.5 screens should make these points visible without explanation:

1. a real possession is the protagonist;
2. this is discovery, not shopping;
3. a person/place/history exists around the object;
4. the layout has a recognizably authored rhythm;
5. controls remain Android-legible;
6. nothing looks like a generic Material sample;
7. nothing requires nostalgia decoration to prove it has personality.

If this works, `Item Detail` reuses the same object language at greater depth instead of inventing a new art direction.
