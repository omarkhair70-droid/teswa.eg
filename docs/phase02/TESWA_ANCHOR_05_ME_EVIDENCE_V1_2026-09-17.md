# TESWA ANCHOR 05 — ME / EVIDENCE V1

**Date:** 2026-09-17  
**Status:** SINGLE DIRECTION — DESIGN SPEC BEFORE IMPLEMENTATION  
**Parent authorities:**
- `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `TESWA_ROOT_MARKS_AND_OBJECT_MEMORY_GRAMMAR_V1_2026-09-17.md`

---

# 1. PURPOSE

`أنا` is not an account dashboard and not a social-media profile.

It is the place where identity and real exchange history accumulate.

The screen must answer:

- who am I here?;
- what has actually happened through me on Teswa?;
- what evidence exists from real exchanges?;
- how do I edit/control my account without letting settings dominate my identity?

The current native implementation gets the evidence philosophy right, but visually it is still a large heading followed by identity, two buttons and evidence rows.

V2 makes this an authored **living archive**.

---

# 2. DESIGN ARCHAEOLOGY

The old Expo profile had stronger visual personality through:

- cover/avatar overlap;
- layered identity composition;
- story/presence signals;
- listing tiles;
- richer sense of a person inhabiting the product.

But it overemphasized:

- followers/following;
- social presence;
- content tabs;
- badges and vanity-like signals.

Keep:

- layered identity;
- image-led personhood;
- authored overlap;
- visual distinction between identity and content/history.

Kill:

- follower-count hierarchy;
- social-profile clone structure;
- content grid as the meaning of the person;
- badge soup.

---

# 3. FIRST VIEWPORT — IDENTITY PORTRAIT

The profile begins with one composed identity portrait, not a giant empty cover rectangle.

## If user has cover image

- cover becomes atmospheric context, not a mandatory banner;
- crop is editorial and can be shallower/taller depending source;
- avatar overlaps the lower edge;
- name/username/area live in the same composition;
- custom ME/EVIDENCE mark appears quietly in the masthead/identity trace.

## If no cover image

Do **not** render a large black/blank placeholder.

Use an authored identity field:

- warm paper + muted color field;
- one large abstract archive frame derived from ME mark;
- avatar remains the strongest personal image;
- subtle object/evidence traces may populate later if real data exists.

No fake stock illustration.

---

# 4. IDENTITY + TRACE

Core identity cluster:

- avatar;
- display name;
- username;
- area/city;
- short bio/tagline if present;
- edit/settings as quiet controls.

Below/around identity, one concise line establishes the archive idea:

Examples:

- `٣ تبديلات خلصوا فعلًا`
- `أثر بيتبني مع كل تبديلة مكتملة`

Do not use this as marketing copy if evidence is zero.

---

# 5. EVIDENCE IS HISTORY, NOT KPI CARDS

Successful swaps, reviews and response behavior should not appear as three dashboard boxes.

Use an **evidence trail**.

## Completed exchange record

One record may show:

- two tiny object identities / thumbnails;
- person counterpart;
- completion date;
- one review/trait trace if available.

The user can open deeper history.

## Summary

At the top of evidence section:

- completed swaps count;
- response signal if meaningful;
- review count/rating if contract supports it.

These are secondary facts, not hero numbers.

No giant circular score.

---

# 6. ARCHIVE COMPOSITION

The visual metaphor is **portrait + accumulated traces**.

Use the ME/EVIDENCE mark geometry:

- identity frame;
- small attached trace/notch;
- repeated archival marks as real outcomes accumulate.

The profile should feel more complete over time because history exists, not because decorative badges are unlocked.

Potential authored details:

- small completion stamp;
- exchange date label;
- object pair miniatures;
- review trait marks;
- archive numbering based on display order only, never database ID.

---

# 7. PUBLIC VS SELF PROFILE

The self profile and public profile share identity grammar but not actions.

## Self

Priorities:

- identity;
- evidence archive;
- edit;
- settings;
- own public possessions as a small secondary window, not management.

Item management belongs to Dolab.

## Public

Priorities:

- who is this person?;
- evidence relevant to interaction;
- public possessions;
- direct-contact boundary;
- report/safety.

The public profile should never expose private Dolab traces.

---

# 8. PUBLIC POSSESSIONS

Active public objects may appear as a small authored strip/cluster using the same Discover object language.

Do not create another marketplace grid.

Suggested composition:

- 2–4 public object moments;
- one larger + smaller companion;
- `شوف كل اللي في اللعب` only when needed.

This section answers what is publicly possible from this person, not what they own privately.

---

# 9. REVIEWS

Reviews are evidence tied to completed exchanges.

Presentation:

- person/reviewer identity;
- relation to completed Deal/object pair;
- rating/comment;
- explicit traits where supported.

Do not render detached star reviews as if this were a seller marketplace.

The review should read as a trace of one completed real-world exchange.

---

# 10. SETTINGS / EDIT

Settings and Edit are quiet native controls.

- small icon/action in identity area;
- full focused screen after entry;
- no settings cards inside the profile body;
- no giant `تعديل الملف` + `الإعدادات` duo consuming the first viewport.

These are controls, not identity.

---

# 11. COLOR / MATERIAL

ME is the most archival/evidence-oriented root.

- warm paper;
- ink;
- sage for settled evidence;
- clay for active/public possibility only;
- muted archival field for completed history;
- cover photography may set atmosphere without recoloring the whole UI.

No black placeholder cover.

---

# 12. MOTION

Meaningful motion:

- avatar/identity continuity into edit/public profile;
- completed exchange record expands into Deal/history;
- public possession opens into Item Detail;
- evidence archive subtly settles after a new bilateral completion/review.

No floating badges or looping profile animations.

---

# 13. EMPTY / NEW USER PROFILE

A new user with no history should still look intentional.

Composition:

- identity portrait;
- ME mark;
- short bio prompt if missing;
- one quiet empty evidence line: `أول تبديلة مكتملة هتبدأ تبني أثرك هنا`;
- public possessions only if any are in play.

Do not fill emptiness with fake metrics or generic empty cards.

---

# 14. IMPLEMENTATION PRIMITIVES

Potential authored primitives after anchor lock:

- `TeswaIdentityPortrait`
- `TeswaEvidenceTrail`
- `TeswaCompletedExchangeRecord`
- `TeswaPublicPossessionStrip`
- `TeswaArchiveTrace`

Do not implement yet until visual review/implementation brief is locked.

---

# 15. WHAT THIS SCREEN MUST NOT BECOME

Reject if it becomes:

- Instagram profile;
- seller dashboard;
- LinkedIn stats page;
- badge achievement wall;
- giant cover + avatar + two buttons + rows;
- public listing management screen;
- generic settings hub.

---

# 16. SUCCESS TEST

A screenshot should communicate:

1. this is one real person, not an account record;
2. their identity has visual authorship;
3. completed exchanges leave visible, calm traces;
4. evidence is contextual rather than gamified;
5. public possessions are secondary to identity/evidence;
6. the screen is recognizably Teswa even with no cover image.
