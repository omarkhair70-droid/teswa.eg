# Teswa — Experience Architecture v0

**Date:** 2026-09-17  
**Status:** AUTHORED EXPERIENCE ARCHITECTURE — BEFORE VISUAL SYSTEM

## Purpose

Teswa now has enough product truth, source research, meaning extraction, digital translation and targeted reference decomposition to define the first experience architecture.

This document does **not** lock final labels, visual styling or bottom-navigation chrome.

It defines:

- the product worlds,
- the main journeys,
- the state objects that must remain legible,
- which contexts can unify and which must stay distinct,
- the first navigation hypothesis worth prototyping.

Canonical state spine:

```text
MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE
```

---

# 1. Architecture rule — organize around relationship state, not accumulated screens

The old product accumulated routes such as:

- Home
- Discover
- Add
- Offers
- Deals
- Messages
- Profile
- Dolab
- Stories
- People
- Nearby

That is implementation history, not architecture.

The new architecture starts from four user realities:

## A. MINE

Things, material and intent that belong to my private world.

## B. POSSIBLE

Things and people I can discover, understand and potentially act on.

## C. BETWEEN US

Shared state that exists because I and another person have interacted consequentially.

## D. ME / EVIDENCE

My identity, exchange history, trust evidence, settings and boundaries.

`REAL` is not necessarily a destination. It is the physical stage inside BETWEEN US where a digital commitment must survive inspection, meetup and handoff.

---

# 2. WORLD A — MINE

## Product role

MINE is the private half of Teswa.

It contains things that may never become public.

Current evidence already supports:
- Dolab items,
- drafts,
- media,
- notes,
- exchange intent,
- saved conversation material,
- linked published item identity,
- exchanged/archive history.

## MINE should support three modes

### CAPTURE

Low-friction entry.

Examples:
- photo now,
- note now,
- audio/material from a conversation,
- Android share intent,
- manual item seed.

Capture does not ask the user to finish a listing.

### FORM

The private object gains enough truth to become useful.

Possible information:
- title / category,
- condition,
- media,
- story/notes,
- exchange intent,
- desired possibility.

### PUT INTO PLAY

Intentional publication threshold.

The user reviews exactly what becomes public and chooses to cross:

```text
MINE → POSSIBLE
```

## Architectural consequence

“Add Item” should not remain a top-level world.

It is an action/path inside MINE.

The product should support:

```text
Capture
→ continue later
→ prepare
→ publish deliberately
```

instead of:

```text
Add tab
→ long form
→ publish or abandon
```

---

# 3. WORLD B — POSSIBLE

## Product role

POSSIBLE is the public field where another person's possession can become relevant to me.

It replaces the assumption that Home and Discover need to be separate conceptual destinations.

POSSIBLE can contain several discovery modes under one product world:

- recommended possibility,
- explicit search,
- categories,
- nearby/local,
- people/inventory relationships,
- exact desire matching,
- flexible exploration,
- surprise discovery.

## Progressive depth

### GLANCE

Answer quickly:
- what is it?
- why might it matter?
- approximately where / how feasible?
- is it active?

### UNDERSTAND

Item context opens deeper:
- object evidence,
- condition,
- media,
- owner openness/desire,
- owner identity/trust cues,
- location/effort.

### PREPARE TO ACT

Before Offer:
- what do I own that is eligible?
- what exactly are they open to?
- what evidence matters before I commit?

## Architectural consequence

Home, Discover and Nearby should not each become independent roots by default.

They are candidate **modes/lenses inside POSSIBLE**.

This leaves room for a future authored discovery composition that is not a marketplace grid.

---

# 4. The ITEM is a bridge object, not a page category

An Item can appear in:

- MINE privately,
- POSSIBLE publicly,
- an Offer,
- a Deal,
- history/evidence.

Therefore Item identity must survive context changes.

## Item representation should know

- object id,
- owner,
- my relationship to owner,
- public/private state,
- availability state,
- current Offer/Deal relationship where relevant,
- evidence depth already known,
- declared openness/desire,
- location feasibility.

## Architectural law

Do not create separate incompatible “Item Card”, “Offer Item”, “Deal Item”, “Profile Listing” mental models.

They can render differently, but they are views of one object identity under different relationship states.

---

# 5. OFFER — first explicit shared threshold

## Entry

An Offer normally begins from a public Item.

User chooses:

```text
I WANT
[their active item]

I PUT FORWARD
[my eligible active item]
```

Optional message adds context but does not define the Offer.

## Offer composition architecture

The user must keep both objects in view while composing.

Required state:
- requested item,
- offered item,
- owner/receiver,
- optional note,
- validation/block state.

## After send

Offer receives durable identity and state.

It may then appear inside:
- item context,
- Between Us inbox,
- notification deep link,
- related conversation/context.

It should always reconstruct the same proposal.

## Receiver response

Current actions:
- Thinking
- Soft Reject
- Accept

Accept must make clear:

```text
Offer
→ Deal
```

not:

```text
Offer
→ chat success
```

---

# 6. WORLD C — BETWEEN US

## Product role

BETWEEN US contains relationships that now affect more than one person.

Candidate content classes:

### OFFERS

Shared proposal state before acceptance.

### DEALS

Accepted exchange state.

### DIRECT REQUESTS / CONVERSATIONS

Person-to-person access state.

### CONTEXTUAL THREADS

Current example: story-reply context.

The architecture may unify these into one root destination, but **must not flatten their contracts**.

## First inbox hypothesis

One root: `BETWEEN US`.

Inside, the system can emphasize **what requires the user's attention** rather than legacy technical type.

Potential grouped states:

- Needs you
- Waiting on them
- Active together
- Messages / conversations
- History

Underlying objects remain typed:
- Offer,
- Deal,
- Direct,
- Contextual.

This can eventually produce a more human inbox than separate Offers / Deals / Messages tabs.

## Guardrail

Grouping by action is allowed.
Erasing state meaning is not.

---

# 7. DEAL — shared object, not conversation wrapper

## Deal header must preserve

- requested item,
- offered item,
- both participants,
- current Deal state,
- next shared action.

## Deal body may contain

- messages,
- voice,
- coordination context,
- meetup/location information if supported,
- inspection/reminder context,
- confirmation state.

## Deal should answer at all times

> What did we agree to?

> What happens next?

> What is still unconfirmed?

Conversation is a tool inside this object.

---

# 8. REAL — the physical stage

REAL is not a tab.

It is a stage in the Deal lifecycle.

Architecture should make room for:

```text
Accepted
→ Coordinating
→ Ready to meet / inspect
→ I confirmed
→ Waiting for them
→ Both confirmed
→ Completed
```

Exact backend states remain authoritative; conceptual labels can be translated in UI later.

## Location changes role here

Before Offer:
- feasibility / effort / discovery relevance.

Inside Deal:
- shared coordination context.

That means Nearby/Map should not own the concept of location globally.

---

# 9. EVIDENCE — distributed trust architecture

EVIDENCE is not one screen.

It is a cross-cutting system.

## At Item level

- media,
- condition,
- description/story,
- owner openness,
- location.

## At Person level

- successful swaps,
- response behavior,
- completed-deal reviews,
- identity/profile continuity.

## At Offer level

- exact pair proposed,
- state/history,
- person context.

## At Deal level

- agreement pair,
- communication,
- confirmation state,
- reporting/safety actions.

## After completion

- behavior-specific review evidence.

Architecture rule:

> Put evidence next to the decision it can inform.

Do not require users to visit a profile dashboard before every meaningful action.

---

# 10. ME — identity and boundaries

ME is narrower than MINE.

## ME owns

- profile identity,
- avatar/cover,
- tagline/bio,
- city/area,
- successful exchange evidence,
- response-rate evidence,
- public history where appropriate,
- connections/follow if they survive,
- settings,
- privacy,
- block/report management,
- account controls.

## MINE owns

- my objects,
- drafts/private material,
- preparation/publishing.

This separation matters.

A person's profile is not the same thing as their private object world.

---

# 11. First root navigation hypothesis

The first architecture worth prototyping is **four roots + one universal creation/capture action**.

```text
POSSIBLE
MINE
BETWEEN US
ME

+ CAPTURE / PUT SOMETHING INTO PLAY
```

This is not final UI chrome.

## Why four roots

### POSSIBLE
Public discovery/intent.

### MINE
Private possession/workspace.

### BETWEEN US
Shared relationships and commitments.

### ME
Identity/evidence/settings.

## Why capture is an action, not a fifth world

“Add” does not represent a persistent place.

It creates/changes an object in MINE.

Therefore a prominent action can launch:
- quick capture,
- new object,
- media import,
- later full preparation.

The exact Android pattern can later be:
- navigation action,
- FAB,
- dock action,
- contextual system entry,
- combination.

Do not choose visual form yet.

---

# 12. Route ownership hypothesis

Current routes can be re-owned conceptually.

| Current capability | Future conceptual owner |
|---|---|
| Home | POSSIBLE |
| Discover | POSSIBLE |
| Nearby | POSSIBLE lens / Deal coordination depending context |
| Item Detail | bridge object opened from any world |
| Add Item | MINE action |
| Edit Listing | MINE / public-object management |
| Dolab | MINE system role |
| Offers | BETWEEN US |
| Deals | BETWEEN US |
| Deal Messages | inside Deal |
| Direct | BETWEEN US |
| Contextual | BETWEEN US with originating context |
| Notifications | cross-product state changes, not root by default |
| Profile | ME |
| Public Profile | person evidence from POSSIBLE/BETWEEN US |
| Reviews | EVIDENCE attached to person/deal |
| Stories | POSSIBLE/context only if thesis test passes |
| People/Follow | POSSIBLE/ME only if thesis test passes |
| Reporting/Block | contextual trust/safety action |

---

# 13. Story / social survival test

Stories and People are not deleted because they are old.
They are not retained because they exist.

They survive only if they strengthen one of these:

```text
Possibility discovery
Trust evidence
Meaningful person/object context
Repeated exchange relationship
Useful contextual conversation
```

If a social surface only increases scrolling/engagement, it fails the authored thesis.

This should be tested after core prototypes rather than before them.

---

# 14. Notification architecture

Notifications should be generated by meaningful state transitions.

Candidate priority order:

## HIGH
- incoming Offer,
- Offer response,
- Deal created,
- Deal message/voice,
- completion confirmation needed,
- Deal completed,
- review available.

## MEDIUM
- direct request,
- direct accepted,
- contextual reply relevant to a real object/person relationship.

## CHALLENGE
- generic follows,
- generic story activity,
- engagement-only alerts.

Notification deep links should land on the changed object:
- Offer,
- Deal,
- Direct conversation,
- Contextual thread,
not merely the app root.

---

# 15. Search architecture

Search belongs first to POSSIBLE.

But later search may span:
- public objects,
- people,
- categories,
- my private objects,
- active relationships.

Do not prematurely build one universal search UI.

First prototype should focus on public possibility discovery/search and preserve query context through item exploration/back navigation.

---

# 16. Architecture-level Android behavior

## Predictive back

Back should preview/return to the exact semantic parent where possible.

Examples:
- Offer composer → requested Item.
- Deal conversation → Deal state.
- public profile opened from Item → Item context.
- item opened from search → same search/result position.

## Deep links

Deep links should reconstruct enough context to answer:
- what changed,
- whose state this is,
- what action is available now.

## System share

Candidate MINE entry:
- image/text/audio shared to Teswa can become private captured material before publication.

## Camera/media

Capture should feed MINE first unless user explicitly began from public creation flow.

---

# 17. First five narrow prototypes

Do not redesign the entire app at once.

## Prototype P1 — MINE → POSSIBLE

Goal:
prove private capture/preparation and intentional publication.

Must test:
- lightweight capture,
- incomplete private state,
- readiness,
- review before public,
- clear publish transition.

## Prototype P2 — POSSIBLE → OFFER

Goal:
prove progressive evidence + object-to-object proposal.

Must test:
- public object comprehension,
- owner openness,
- choose my eligible object,
- keep both visible,
- send durable proposal.

## Prototype P3 — INCOMING OFFER → DEAL

Goal:
prove Thinking / Soft Reject / Accept and acceptance threshold.

Must test:
- proposal legibility,
- status clarity,
- accept creates shared Deal identity,
- transition feedback.

## Prototype P4 — DEAL → REAL → COMPLETED

Goal:
prove agreement ≠ completion.

Must test:
- exchange pair stays visible,
- coordination context,
- first confirmation,
- waiting-for-other state,
- bilateral completion,
- review unlock.

## Prototype P5 — CONVERSATION ↔ MINE

Goal:
prove Dolab/private-world distinctiveness.

Must test:
- save message/material to MINE,
- share private material intentionally into conversation,
- no accidental public exposure.

---

# 18. Prototype order

Recommended order:

```text
P2 → P3 → P4 → P1 → P5
```

Reason:

The most distinctive high-risk system is the shared exchange spine:

```text
Possible
→ Offer
→ Deal
→ real completion
```

If that cannot become clear and authored, the rest of the product will collapse back into marketplace conventions.

MINE then expands backward from the known commitment system rather than becoming a decorative wardrobe concept.

---

# 19. What is now allowed

The project can now begin targeted visual/interaction research for **Prototype P2 only**.

Allowed questions:
- How can two objects remain equally legible in one mobile composition?
- How do strong mobile systems visually encode “mine” vs “theirs” without relying only on left/right?
- How can progressive evidence expand without card soup?
- How can an offer feel consequential without feeling like checkout?
- How can state transition from possibility to proposal be physically understandable?

Still forbidden:
- redesigning every screen,
- picking a global visual style from a moodboard,
- copying marketplace cards,
- locking final navigation chrome,
- building motion before static/state comprehension passes.

---

# 20. Experience Architecture result

**Experience Architecture v0: PASS.**

The first coherent root model is:

```text
POSSIBLE  = public possibilities
MINE      = private possessions / preparation
BETWEEN US = proposals, deals and consequential conversations
ME        = identity, evidence and boundaries

CAPTURE / PUT INTO PLAY = action into MINE, not a fifth world
```

The first prototype lane is now open:

> **P2 — POSSIBLE → STRUCTURED OFFER**

That lane should now run the mature workflow again:

```text
reality recheck
→ targeted reference recheck
→ lane thesis
→ static/state compositions
→ implementation experiment
→ real-device capture
→ compare
→ KEEP / REWRITE / DELETE
```

No broad redesign until P2 earns its grammar.