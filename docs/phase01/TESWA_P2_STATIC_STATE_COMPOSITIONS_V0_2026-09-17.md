# Teswa P2 — Static / State Compositions v0

**Date:** 2026-09-17  
**Status:** STRUCTURAL COMPOSITION PASS — NO FINAL VISUAL SYSTEM

## Objective

Design the first authored composition for:

```text
POSSIBLE → PROPOSAL
```

without choosing Teswa's final palette, type family, card language or motion style.

The screen must make one relationship obvious before anything else:

```text
THEIR OBJECT
↕
MY OBJECT
```

The current production-like Compose form is deliberately ignored as visual authority.

---

# Candidate A — PAIR FIELD / VERTICAL TENSION

## Core idea

One continuous field contains both possessions.

The requested object occupies the upper region. The lower region is initially unresolved and asks the user to bring one eligible possession into the proposal.

The relationship lives in the seam between them.

### S0 — Entry

```text
┌──────────────────────────────┐
│  ←                           │
│                              │
│   THEIR POSSIBILITY          │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │    requested image     │  │
│  │                        │  │
│  └────────────────────────┘  │
│  اسم الحاجة                   │
│  @owner · condition · area    │
│  owner openness / desire      │
│                              │
│          ┊                   │
│     إنت عايز دي               │
│          ┊                   │
│   وحاطط إيه قدامها؟           │
│          ┊                   │
│                              │
│  ┌────────────────────────┐  │
│  │   + اختار من حاجتك      │  │
│  │   active items only     │  │
│  └────────────────────────┘  │
│                              │
│  [ إرسال العرض — disabled ]   │
└──────────────────────────────┘
```

The empty lower region is intentionally not another product card. It represents an unanswered side of the relation.

### S1 — Selecting Mine

Requested object remains visually anchored behind/above selection context.

Candidate mobile mechanism: modal bottom sheet with active owned items.

```text
PAIR FIELD remains visible
───────────────────────────────
╭──────────────────────────────╮
│ من حاجتك المعروضة             │
│                              │
│ [image] كاميرا قديمة         │
│         condition            │
│                              │
│ [image] سماعة                │
│         condition            │
│                              │
│ [image] جاكيت                │
│         condition            │
╰──────────────────────────────╯
```

Selection does not send anything.

### S2 — Pair Formed

```text
┌──────────────────────────────┐
│   THEIR OBJECT               │
│  [ large evidence area ]     │
│  title · owner               │
│                              │
│        أنا عايز دي            │
│            ⇅                 │
│        وبقدّم دي              │
│                              │
│  [ MY OBJECT evidence ]      │
│  title                       │
│  تغيير الحاجة                │
│                              │
│  + ضيف رسالة                 │
│                              │
│  [ ابعت عرض التبديل ]         │
│  العرض هيبقى مستني رد صاحبه   │
└──────────────────────────────┘
```

Critical change from S0:

The lower object is now **inside the same proposition field**. It is no longer rendered as an inventory list row.

### S3 — Optional Context

The pair stays intact.

Message opens below the pair as a subordinate disclosure, not a permanent large text field competing with the objects.

```text
[ THEIR OBJECT ]
       ⇅
[ MY OBJECT ]

رسالة مع العرض
┌──────────────────────────────┐
│ اكتب حاجة تساعده يفهم...      │
└──────────────────────────────┘

[ ابعت عرض التبديل ]
```

### S4 — Sending

Never replace the whole composition with a spinner.

```text
[ THEIR OBJECT ]
       ⇅
[ MY OBJECT ]

[ جاري تثبيت العرض… ]
```

The state being created remains visible during network wait.

### S5 — Sent / Pending

Do not show generic celebration.

Transform the pair composition into the first Offer state object:

```text
┌──────────────────────────────┐
│ عرضك اتبعت                   │
│ مستني الرد                   │
│                              │
│ [ THEIRS ]  ⇄  [ MINE ]      │
│                              │
│ أُرسل الآن                    │
│                              │
│ [ تابع العرض ]               │
└──────────────────────────────┘
```

The visual continuity teaches:

> what I just composed now exists as durable shared product state.

---

# Candidate B — REQUESTED OBJECT + ANSWER DOCK

## Core idea

Requested item dominates the page as normal item context. A persistent bottom dock represents “my answer.”

Before selection:

```text
[ requested item detail ]

───────────────────────────────
Your answer
[ اختار حاجة من عندك ]
```

After selection:

```text
[ requested item detail ]

───────────────────────────────
Your answer
[ my item mini summary ]
[ Send ]
```

## Strengths

- compact;
- preserves requested-item context strongly;
- technically straightforward;
- maps naturally to a bottom-sheet item picker.

## Weaknesses

- relationship can feel like “attach item to action” rather than a true proposition;
- one object dominates and the other risks becoming metadata;
- too close to a commerce/product-detail CTA pattern;
- weaker translation of `two possessions held in one frame`.

## Decision

**KEEP as fallback interaction pattern, not lead composition.**

It may become useful on smaller devices or as an intermediate selector state.

---

# Candidate C — SIDE-BY-SIDE EXCHANGE TABLE

## Core idea

Two equal object panels sit beside each other with a central relation mark.

```text
┌──────────────┬──────────────┐
│   THEIR      │    MINE      │
│   IMAGE      │    IMAGE     │
│   TITLE      │    TITLE     │
└──────────────┴──────────────┘
         ↔
```

## Strengths

- instant symmetry;
- proposal comparison is obvious;
- highly compact after pair formation.

## Weaknesses

- phone width crushes long Arabic titles and evidence;
- encourages false “equal value / comparison table” reading;
- can imply Teswa is calculating equivalence;
- accessibility/RTL reading order becomes more fragile;
- unsuitable before selection unless one side becomes an awkward blank half.

## Decision

**KILL as primary mobile composition.**

May survive later as a compact summary representation inside Offer inbox/history, where both items are already known and only identity/state needs to be recalled.

---

# Structural choice

## LEAD: Candidate A — Pair Field / Vertical Tension

Why:

1. it translates Teswa's authored meaning directly;
2. it works naturally in one-handed portrait Android;
3. it gives both possessions enough space without implying algorithmic equality;
4. it creates an authored seam that can later carry state/motion;
5. it degrades well when media is missing;
6. it keeps Arabic text readable;
7. it gives the transition `empty answer → selected possession → durable Offer` a clear visual grammar.

Candidate B remains useful as a small-screen / selector fallback.
Candidate C is demoted to compact summaries after an Offer already exists.

---

# The authored seam

The seam is the most important new visual/interaction primitive in P2.

It is **not** a swap icon.

It is a zone that communicates relationship state.

## Seam state 0 — OPEN

Meaning:

> one side is known; my answer is missing.

Properties:
- visually unresolved;
- text explains `إنت عايز دي / هتحط إيه قدامها؟`;
- no implication of commitment yet.

## Seam state 1 — FORMED

Meaning:

> both sides of the proposal now exist locally, but nothing was sent yet.

Properties:
- relation becomes more explicit;
- Send becomes available;
- selected object can still be changed.

## Seam state 2 — COMMITTED / PENDING

Meaning:

> this pair now exists as an Offer known to the other person.

Properties:
- proposal status enters the seam (`مستني الرد`, later `بيفكر`, etc.);
- relationship becomes history/state rather than a local draft.

This one primitive could later connect:

```text
creation
→ sent Offer
→ thinking
→ soft reject
→ accept / Deal
```

without rebuilding a completely unrelated visual model for every status.

---

# Object representation inside P2

P2 should not attempt to solve the universal Teswa object component yet.

For this lane, each object only needs enough truth for commitment:

## Requested side

- image or strong media fallback;
- title;
- owner identity;
- basic condition;
- rough place/feasibility if available;
- declared desire/openness if available.

## Mine side

- image/fallback;
- title;
- enough state to prove eligibility/identity;
- a clear “change” action before send.

Do not duplicate all listing details.
The user can inspect deeper context through an explicit action if needed.

---

# RTL / accessibility reading model

Semantic order should remain:

```text
1. Requested item
2. Relationship explanation
3. Offered item / choose offered item
4. Optional message
5. Commitment consequence
6. Send action
```

Do not rely on visual top/bottom or arrow direction as the only meaning.

TalkBack labels should say the relationship explicitly, e.g. conceptually:

- `العنصر المطلوب: …`
- `العنصر اللي هتقدمه: …`
- `حالة العرض: لم يتم الإرسال بعد`

Exact strings are a later implementation/copy pass.

---

# Long-content stress test

Prototype must intentionally test:

- requested title at 120–160 characters;
- mine title at 120–160 characters;
- Arabic + English model names mixed;
- missing requested image;
- missing mine image;
- owner display name + username;
- no owner desire text;
- desire text long enough to wrap;
- keyboard open with optional message;
- smallest supported portrait width.

If the relationship breaks under these states, the composition is not ready.

---

# Prototype build specification

The first Compose lab should render at least:

```text
P2Entry
P2SelectingMine
P2PairFormed
P2PairWithMessage
P2Sending
P2Pending
P2NoEligibleMine
P2Conflict
```

The lab should use fake local data only.

It must not:
- call Oracle,
- alter production navigation,
- replace `OfferCreationScreen`,
- require release assets,
- enter the v26 release path.

The purpose is structural rendered review.

---

# Gate

**Static / State Composition: PASS v0 for implementation as a disposable lab.**

Next:

> create a debug-only Compose `StructuredOfferLab` implementing Candidate A, render/capture on Android, then KEEP / REWRITE / DELETE based on the actual device result.