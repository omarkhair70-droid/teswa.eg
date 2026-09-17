# TESWA ANCHOR 02 — DOLAB V1

**Date:** 2026-09-17  
**Status:** SINGLE DIRECTION — DESIGN SPEC BEFORE IMPLEMENTATION  
**Parent authorities:**
- `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `TESWA_ROOT_MARKS_AND_OBJECT_MEMORY_GRAMMAR_V1_2026-09-17.md`

---

# 1. PURPOSE

Dolab is not `My Listings` and not a file manager.

It is the private room where an object exists before the user decides to expose it to possibility.

The screen must feel:

- private;
- tactile;
- personal;
- unfinished in a good way;
- organized enough to trust;
- clearly different from public Discover.

Product truth:

> **An object belongs to me before it belongs to Teswa's public field.**

The current native screen gets this semantically right, but visually it still behaves like:

`heading → explanatory box → filter chips → repeated rows`.

V2 replaces that composition while keeping the existing states and Oracle contracts intact.

---

# 2. DESIGN ARCHAEOLOGY

The old Expo `DolabVaultHero` had useful instinct:

- it treated Dolab as a place rather than a list;
- it used a private-space cue;
- it gave the area its own atmosphere;
- it attempted to communicate that media, ideas and exchange intent lived together.

But it also drifted toward a generic "vault/dashboard" metaphor with badges, capability pills and decorative glow.

Keep:

- sense of place;
- private atmosphere;
- authored top moment;
- mixed media / notes / object preparation as one world.

Kill:

- capability-pill dashboard;
- archive icon cliché;
- decorative looping glow as identity;
- explanatory hero copy that takes a whole viewport.

---

# 3. DOLAB VISUAL METAPHOR

The authored metaphor is **WARDROBE / SHELF / PRIVATE COLLECTION**, reduced to a layout grammar rather than literal furniture.

The custom MINE mark provides the geometry:

- outer private frame;
- central seam;
- shelf/divider;
- one object capable of crossing the boundary.

The screen should suggest "things kept here" without drawing a realistic wardrobe.

---

# 4. FIRST VIEWPORT

The first viewport has four layers.

## LAYER A — QUIET PRIVATE MASTHEAD

RTL composition:

- custom MINE / wardrobe mark;
- `دولابي` title;
- one compact status line, not a paragraph;
- authored `حط حاجة` / capture action;
- optional overflow/search only when needed.

Suggested status examples:

- `٧ حاجات عندك · ٢ جاهزين للّعب`
- `كل حاجة تبدأ هنا`

No permanent explanatory card under the title.

The current message `هنا الحاجة لسه بتاعتك إنت` belongs in first-use/empty education, not every normal session.

---

## LAYER B — THE PRIVATE SHELF

Instead of immediately showing chips and rows, show the first 3–5 possessions as a composed private shelf.

This is not a masonry marketplace grid.

### Shelf grammar

Use one bounded template:

- one larger portrait/square object;
- two smaller object snapshots;
- one open gap / breathing area;
- a subtle shelf/seam line derived from the MINE mark;
- no outer card around the whole group.

Each object is a private snapshot:

- image if available;
- title;
- one state cue;
- optional tiny note/media count only when relevant;
- no public owner/location chrome.

Objects may have slightly different photo-edge treatments depending on state, but no random rotation beyond a tiny authored offset and only when safe.

---

## LAYER C — STATE RAIL, NOT FILTER CHIP SOUP

The current filters remain functionally useful, but their presentation becomes a **state rail** tied to the object lifecycle.

Order:

`الكل · بتتجهز · جاهزة · في اللعب · الأرشيف`

Visual behavior:

- one continuous quiet rail;
- selected state indicated by a small line/marker + text weight;
- not five independent pill buttons;
- horizontally scrollable if needed;
- touch targets remain 48dp.

The rail should feel like looking across shelves/states, not applying ecommerce filters.

---

## LAYER D — OBJECT COLLECTION CONTINUES

Below the authored shelf, objects continue using a bounded mix of:

- `PrivateSnapshotLarge`;
- `PrivateSnapshotCompact`;
- `PrivateObjectRow` only when density is necessary.

Rows are not the default visual identity.

---

# 5. PRIVATE OBJECT STATE LANGUAGE

Each state must feel different without inventing a new component family.

## DRAFT / IN PROGRESS

Feeling: raw and still being worked on.

Treatment:

- soft paper edge;
- lower contrast metadata;
- optional tiny pencil/margin mark;
- private note count may show;
- no public-state color emphasis.

## READY

Feeling: prepared, still mine.

Treatment:

- image presented more cleanly;
- subtle readiness notch/marker;
- one clear next-action cue;
- no public clay emphasis yet.

## PUBLISHED / IN PLAY

Feeling: one foot outside the wardrobe.

Treatment:

- object visually crosses or breaks the private boundary/seam;
- clay enters the state trace;
- `في اللعب` appears as authored state label;
- public preview is one tap away.

This is the most important visual contrast inside Dolab.

## EXCHANGED

Feeling: no longer merely mine, but part of my history.

Treatment:

- calm archival state;
- relation/completed trace;
- no destructive visual fade as if deleted.

## ARCHIVED

Feeling: tucked away.

Treatment:

- reduced chroma;
- object sits deeper/behind the shelf line;
- still legible and retrievable.

---

# 6. CAPTURE / `حط حاجة`

The universal object action must begin with the object, not a form.

Entry motion:

- `Put Into Play` authored mark appears in compact form;
- user chooses camera/gallery;
- captured image lands into the private shelf/working area;
- only then do title/category/condition fields become prominent.

The capture flow should feel like **placing something in Dolab**, not filling a listing wizard.

Existing media and camera behavior is preserved.

---

# 7. DOLAB ITEM DETAIL

Current detail is structurally useful but visually reads like a settings/form page.

V2 order:

1. focused back header, very quiet;
2. large private object image / media strip;
3. object title + current state;
4. private trace area — notes / voice / memory;
5. durable identity fields;
6. state history / publication bridge;
7. one primary next action.

### Private trace area

This is where Dolab gets emotional specificity without fake sentiment.

If notes/voice/media exist, show them as traces around the object:

- note snippet on a paper-like strip;
- voice as compact waveform/player;
- capture date when useful;
- no giant card per note.

The private trace never leaks to public item detail unless explicitly published by an existing contract.

---

# 8. PUBLISH BRIDGE — THE SIGNATURE MOMENT

This is the key art-direction transition of MINE.

Before publish:

- object is visibly inside the private Dolab composition;
- private traces remain behind / quiet;
- public fields are previewed.

On publish:

- object image moves across the private boundary/opening;
- state shifts from muted/private to clay-accent public possibility;
- one medium confirmation haptic;
- no confetti;
- no new unrelated success card.

After publish:

- same object stays visible;
- `في اللعب` label appears;
- actions: `شوفها زي ما الناس شايفاها` / `ارجع لدولابي`.

This moment visually proves the product thesis.

---

# 9. EMPTY DOLAB

The current empty-state copy is conceptually correct but must become more authored.

Composition:

- large MINE mark / wardrobe frame;
- one empty shelf line;
- one small object-shaped placeholder waiting to be placed;
- title: `دولابك فاضي دلوقتي`;
- copy: short, one sentence;
- primary: `حط أول حاجة`.

No giant generic illustration package.

The empty state should be portfolio-worthy and explain the metaphor by itself.

---

# 10. MATERIAL / COLOR

Dolab is the quietest root world.

Use:

- warm paper field;
- slightly deeper muted private field;
- ink;
- sage in calm/private evidence moments;
- clay only when an object approaches or reaches public possibility;
- amber only for unresolved attention.

Do not make Dolab a brown wardrobe theme.

The furniture metaphor lives in geometry, not wood textures.

---

# 11. TYPOGRAPHY

- root masthead: compact, not giant;
- object titles: stronger than section labels;
- note/trace text: body/secondary body;
- state rail: labelMedium / semibold selected;
- archive numbers/stamps: tiny label role, never body copy.

No handwritten dynamic Arabic font.

---

# 12. MOTION

Meaningful motion only:

- capture → shelf placement;
- reorder if supported;
- private object → publish review;
- publish crossing;
- archive recede;
- open object detail continuity.

No ambient breathing/glow loops.

Dolab should feel calm when nothing changes.

---

# 13. IMPLEMENTATION PRIMITIVES

Target authored primitives for later implementation:

- `TeswaMineMasthead`
- `TeswaPrivateShelf`
- `TeswaPrivateSnapshot`
- `TeswaLifecycleRail`
- `TeswaPrivateTrace`
- `TeswaPublishCrossing`

Do not implement them yet until the anchor family is complete.

Existing utility components remain usable underneath.

---

# 14. WHAT THIS SCREEN MUST NOT BECOME

Reject if it becomes:

- file manager;
- photo gallery clone;
- ecommerce seller dashboard;
- literal wooden wardrobe skeuomorphism;
- five filter pills + rows again;
- scrapbook chaos;
- "vault" fintech aesthetic;
- decorative private notes leaking publicly.

---

# 15. SUCCESS TEST

A screenshot should make a viewer understand without explanation:

1. these are my things;
2. they are private/preparatory here;
3. different objects are at different lifecycle stages;
4. one of them can visibly cross into public possibility;
5. the interface has a distinct Teswa identity;
6. it does not look like Discover with different labels.
