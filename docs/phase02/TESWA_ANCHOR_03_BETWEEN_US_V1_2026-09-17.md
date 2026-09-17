# TESWA ANCHOR 03 — BETWEEN US V1

**Date:** 2026-09-17  
**Status:** SINGLE DIRECTION — DESIGN SPEC BEFORE IMPLEMENTATION  
**Parent authorities:**
- `TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `TESWA_ROOT_MARKS_AND_OBJECT_MEMORY_GRAMMAR_V1_2026-09-17.md`

---

# 1. PURPOSE

`بيننا` is the visual proof that Teswa is not just a marketplace.

This is where one possession and another possession, or one person and another person, become related.

The current semantic grouping is correct:

- `محتاجك`;
- `مستني`;
- `بينكم دلوقتي`;
- `رسائل`;
- `السجل`.

But the current rows flatten too much into:

`generic icon → title → supporting text → status pill`.

That makes the screen read like a cleaned-up inbox.

V2 must make the relationship visible before it is read.

Core visual law:

> **TWO THINGS + ONE RELATION.**

---

# 2. THE BETWEEN US MARK BECOMES THE SCREEN GRAMMAR

The custom BETWEEN US mark contains:

- one object/person node;
- another object/person node;
- one authored bridge between them.

The screen scales this geometry up.

The user should repeatedly see:

`mine / me`  — relation —  `theirs / them`

without turning every row into a diagram.

The bridge changes meaningfully with state.

---

# 3. FIRST VIEWPORT

## LAYER A — COMPACT RELATIONAL MASTHEAD

- custom BETWEEN US mark;
- `بيننا` title;
- one short state summary if useful, e.g. `حاجتين محتاجينك`;
- no explanatory paragraph;
- no generic tab bar for messages/offers.

The root itself is already the combined semantic hub.

---

## LAYER B — WHAT NEEDS YOU

If there is an actionable incoming offer or direct request, it owns the first authored block.

### Incoming offer moment

Do not show a generic list row.

Show:

- requested object image/identity on one side;
- offered object image/identity on the other;
- relation bridge between them;
- sender/person anchor;
- state `مستني قرارك`;
- one clear tap target into detail.

The pair is the headline.

Text like `A مقابل B` becomes fallback/support, not the only way the relationship is represented.

### Direct request moment

Because there is no object pair, the relational grammar changes to:

`person → request boundary → me`.

Use avatar/person identity + request trace, not a fake object pair.

---

# 4. ACTIVE DEALS — THE STRONGEST BLOCK

`بينكم دلوقتي` should be the strongest recurring composition in the root.

A Deal block includes:

- both object images if available;
- compact participant identity;
- persistent relation seam;
- exact state;
- next required action;
- last meaningful activity / timestamp when available.

Do not lead with chat preview.

The user is not entering a chat. They are entering a **shared exchange state** that contains communication.

### State-specific visual bridge

#### Coordinating
Continuous relation seam, calm clay/sage balance.

#### One side confirmed
One side of the seam settles/completes; the other remains open.

#### Waiting for my confirmation
My side is visually the unresolved endpoint; action is obvious.

#### Completed
The seam becomes an archival trace and the whole pair quiets.

No confetti or giant green success card.

---

# 5. WAITING / SENT OFFERS

Outgoing pending offers should feel suspended, not broken.

Composition:

- compact ExchangePair;
- recipient anchor;
- state `مستني رد` / `بيفكر`;
- bridge lighter than accepted Deal;
- no spinner;
- no progress-bar metaphor.

If there are many, use a denser row variant but preserve both object thumbnails.

---

# 6. MESSAGES

Direct and contextual conversations remain distinct, but they are visually quieter than active exchange states.

## Direct

Show:

- person avatar;
- request/direct state;
- latest line;
- unread marker;
- time.

## Contextual story reply

Show:

- person avatar;
- small story/entity fragment;
- latest line;
- label `رد على قصة`.

Do not flatten the original context after the first message.

## Deal conversation

Deal conversation is not represented here as a generic person chat if there is an active Deal block already.

The Deal is the primary durable entity.

---

# 7. HISTORY / ARCHIVE

History should visually quiet down and become more archival.

Use:

- reduced image scale;
- muted relation seam;
- date/outcome trace;
- completed/cancelled state;
- no large action buttons.

This is where the nostalgia/trace layer can appear most naturally: completed relation as a small archival record rather than another notification row.

---

# 8. THE EXCHANGE PAIR V2

The current `TeswaExchangePair` has the correct product responsibility but must evolve visually.

New authored primitive target:

`TeswaExchangeRelation`

Contracts:

- requested item always identifiable;
- offered item always identifiable;
- direction/ownership remains semantically clear in RTL;
- one authored relation seam;
- optional participant anchor;
- state-specific relation styling;
- compact and expanded variants share geometry.

Variants:

- `Compose` — one side may be empty/choosable;
- `Pending`;
- `Thinking`;
- `Accepted`;
- `DealActive`;
- `OneSideConfirmed`;
- `Completed`;
- `HistoryCompact`.

State changes the bridge and density, not the meaning of the objects.

---

# 9. OFFER → DEAL TRANSITION

This is the second signature motion after Dolab → Publish.

Before acceptance:

- two objects face each other with a lighter/incomplete relation.

On acceptance:

- both object identities stay in place;
- relation seam becomes continuous;
- pair compresses/settles into durable Deal header geometry;
- medium/success haptic;
- surrounding offer actions disappear;
- coordination context enters below.

Do not fade out Offer and open a visually unrelated Deal screen.

The user should feel: **the same proposal became real shared state**.

---

# 10. DEAL ROOM

The Deal room must have a persistent authored header.

Header anatomy:

- requested object;
- offered object;
- participant identity;
- deal state;
- relation seam;
- next-action cue.

Below:

- coordination / messages;
- voice;
- meetup/location context when supported;
- completion action;
- safety/report secondary actions.

The pair can compact while scrolling but must never disappear entirely from the conversation context.

---

# 11. COMPLETION VISUAL TRUTH

The app must visually preserve asymmetry when only one side has confirmed.

Do not show a fully completed pair until both sides confirm.

### First-side confirmation

- confirming side endpoint receives completed/evidence trace;
- opposite endpoint remains open;
- copy states exactly who is pending.

### Bilateral completion

- relation seam settles fully;
- both endpoints gain calm archival state;
- date/outcome trace may appear;
- review becomes available.

This is one of the most important honesty rules in the product.

---

# 12. COLOR / MATERIAL

Between Us is neither fully clay nor fully sage.

- clay = authored action / proposal energy;
- sage = trust / settled shared state;
- amber = unresolved attention;
- paper = base;
- muted archive field = history.

The relation seam can move through these semantic roles with state.

Do not color-code each row category arbitrarily.

---

# 13. MOTION

Meaningful authored motion:

- offer pair formation;
- selecting own object into empty side;
- pending → thinking state morph;
- accepted → Deal settle;
- first completion asymmetry;
- bilateral completion archive settle.

Routine inbox scrolling and message arrival should stay quiet.

No ambient pulsing bridge.

---

# 14. EMPTY BETWEEN US

The empty state should explain the concept with the mark itself.

Composition:

- two separated object forms;
- no relation seam yet;
- title: `لسه مفيش حاجة بينكم`;
- one short sentence;
- optional route back to Discover.

When the first offer exists, the bridge appears for the first time.

That makes the visual metaphor learnable without onboarding copy.

---

# 15. ACCESSIBILITY / RTL

- visual left/right must never imply ownership without text/semantics;
- TalkBack order: requested object → relation/state → offered object → participant → action;
- pair collapses vertically when large font scale would squeeze Arabic;
- relation line is decorative and cannot be the sole state indicator;
- state remains written explicitly;
- touch target covers the full relational block.

---

# 16. WHAT THIS SCREEN MUST NOT BECOME

Reject if it becomes:

- WhatsApp inbox with swap icons;
- banking transaction list;
- order-management dashboard;
- Tinder match screen;
- two cards separated by `↔` text only;
- giant status pills replacing composition;
- animated relationship gimmick everywhere.

---

# 17. SUCCESS TEST

A screenshot containing one incoming offer, one active Deal and one direct message should make the hierarchy obvious without reading every label:

1. offer = two possessions considering a relation;
2. Deal = two possessions already bound in shared state;
3. direct message = person conversation, quieter and different;
4. `بيننا` feels unique to Teswa rather than a generic inbox;
5. the same relation geometry can continue into the Offer and Deal detail screens.
