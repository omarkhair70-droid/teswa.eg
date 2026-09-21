# Teswa — Digital Translation v0

**Date:** 2026-09-17  
**Status:** MEANING → DIGITAL BEHAVIOR — NO EXTERNAL UI REFERENCES YET

## Purpose

The thesis is now authored strongly enough to translate into digital behavior.

This document does **not** choose:
- final navigation,
- palette,
- typography,
- card language,
- illustration,
- visual references,
- final motion style.

It asks one question:

> If the meaning system is true, how should the product behave on a native Android device?

Locked meaning system:

1. **Possession → Possibility**
2. **Private ↔ Public threshold**
3. **Certainty is earned in layers**
4. **Agreement ≠ Completion**
5. Supporting: **Proposal = first explicit commitment threshold**

---

# 1. Translation law — state before surface

Every future screen/component should know which world it belongs to:

```text
MINE
POSSIBLE
BETWEEN US
REAL / OUTCOME
```

A surface may bridge worlds, but it must not obscure the transition.

Before styling anything, every interaction should answer:
- What state am I in?
- Whose object/context is this?
- What becomes true if I act?
- Can I reverse it?
- Does another person become affected?

This becomes a product-wide interaction grammar.

---

# 2. MINE — translating private possession

## Meaning

Private is not a failed listing.
Private is a legitimate product state.

## Digital behavior

A private object should be able to exist with incomplete public information.

Private object behavior may support:
- capture now, describe later,
- notes that never need to become public,
- media gathered before publication,
- exchange intent drafted privately,
- material saved from conversation,
- readiness state distinct from publication.

## Interaction consequence

Do not force `Publish` as the primary next action for every private object.

Possible next actions can include:
- continue preparing,
- attach evidence/media,
- write intent,
- archive/private keep,
- share into conversation,
- put into play.

## Native opportunity

Android share intents, camera/gallery, audio, notifications and quick capture can eventually feed MINE without routing everything through a long listing form.

Translation candidate:

> **Capture can be lightweight; publication is deliberate.**

---

# 3. PUBLICATION — translating private → possible

## Meaning

Publication is an intentional threshold.

## Digital behavior

The final publication action should make the state change legible:

```text
private object
→ publicly discoverable possibility
```

Before crossing, the user should understand:
- what becomes visible,
- which media/details are public,
- what kind of exchange openness they are declaring,
- location precision being shared,
- whether the item is immediately active.

## Do not

- make publish look like ordinary “Save”,
- silently expose private notes,
- treat owner desire as optional decoration if it materially affects offers,
- auto-publish captured material without explicit intent.

## Native opportunity

Publication can use subtle haptic/system feedback because it changes social state, not because haptics are decorative.

Candidate feedback hierarchy:
- private edit save → minimal/no haptic,
- publish → distinct confirmation,
- destructive withdrawal/archive → explicit confirmation feedback.

Exact haptic pattern is not selected yet.

---

# 4. POSSIBILITY — translating discovery

## Meaning

Discovery is not “show products.”

It is:

> Which public possibilities are actionable or interesting to this person now?

## Representation layers

A discoverable object may need to expose different evidence depending on decision depth.

### Glance layer

Enough to answer:
- what is it?
- why might I care?
- is it plausibly reachable/available?

### Interest layer

Enough to answer:
- who owns it?
- condition/evidence?
- what are they open to?
- where approximately?

### Commitment-prep layer

Enough to answer:
- what can I offer?
- what trust evidence matters now?
- are there constraints/blocking/state changes?

Do not force every evidence field into every discoverable representation.

This operationalizes:

> **certainty is earned in layers.**

---

# 5. DESIRE MODE — translating openness

Current Add Item contract recognizes:
- specific,
- flexible,
- surprise.

This should eventually affect product behavior, not only form storage.

## Specific

The owner already has a target in mind.

Digital implication:
- proposals can be judged against a clearer declared preference,
- discovery/matching may prioritize closer fits.

## Flexible

The owner has boundaries but is open.

Digital implication:
- proposals can carry more exploratory range.

## Surprise

The owner explicitly permits unexpected possibilities.

Digital implication:
- the system may justify broader discovery/proposal suggestions.

Guardrail:

Never infer openness beyond what the owner declared.

---

# 6. OFFER — translating possibility → proposal

## Meaning

Offer is the first explicit commitment threshold.

## Required structural legibility

The offer interaction must preserve:

```text
I WANT: [their item]
I PUT FORWARD: [my item]
OPTIONAL CONTEXT: [message]
STATE: [pending/thinking/etc.]
```

## Before sending

The user should be able to inspect both sides without losing context.

The system should make obvious that sending:
- creates a durable proposal,
- notifies another person,
- may affect item lifecycle/history.

## After sending

The proposal becomes a state object.

It should not visually collapse into a normal sent message.

## Receiver responses

Current meaningful actions:
- thinking,
- soft reject,
- accept.

Interaction translation:

### Thinking
Not passive silence.
Acknowledge that the proposal is still alive but decision is deferred.

### Soft reject
Close this proposal without framing the other person's item as worthless.

### Accept
Strong threshold.
Must clearly communicate that acceptance creates a shared Deal state.

## Native feedback

Accept is a meaningful candidate for stronger haptic/state-transition feedback than ordinary messaging.

Exact animation/haptic remains open.

---

# 7. DEAL — translating acceptance → shared state

## Meaning

A Deal belongs to **BETWEEN US**.

Neither user owns this state alone.

## Digital behavior

The Deal should keep visible:
- requested item,
- offered item,
- both participants,
- current deal state,
- relevant messages,
- what still needs to happen.

The deal surface should answer:

> What have we agreed to, and what remains unresolved?

## Context persistence

When conversation opens, the exchange pair must remain recoverable without relying on memory.

Avoid:
- losing item context behind a generic chat header,
- making users scroll to reconstruct the original offer,
- using vague “active” labels without next-action meaning.

---

# 8. COORDINATION — translating agreement ≠ completion

## Meaning

Accepted offer = digital commitment.
Completed exchange = real-world outcome.

There must be an intermediate coordination state.

## Digital behavior

Coordination may eventually need to make legible:
- meetup intent,
- time/location information where product scope supports it,
- item inspection reminders relevant to category,
- current confirmation state,
- changes/cancellation where backend supports it.

Current contract already proves:
- one participant can confirm,
- product waits for the other,
- completion only becomes true after mutual confirmation.

## State language principle

Never label first confirmation as “completed.”

Possible semantic hierarchy:

```text
Accepted
→ Coordinating
→ You confirmed / Waiting for them
→ Both confirmed / Completed
```

Exact copy remains open.

---

# 9. MUTUAL COMPLETION — translating real-world outcome

## Meaning

Completion is a jointly confirmed event.

## Digital behavior

First confirmation:
- should show what the current user asserted,
- should show that the other person's confirmation is still missing,
- should remain reversible only if backend/product policy actually allows reversal.

Second confirmation:
- changes deal state for both,
- unlocks post-exchange review,
- can alter item history/state.

## Feedback opportunity

This is one of the strongest candidates in the entire app for authored completion feedback because a real-world loop has closed.

But celebration must not obscure:
- which items were exchanged,
- that both confirmed,
- what becomes available next (review/history).

---

# 10. TRUST — translating progressive evidence

Trust should be assembled contextually.

## Object truth evidence

Potential layers:
- media,
- condition,
- condition notes,
- story/description,
- category-specific details,
- owner consistency.

## Person evidence

Potential layers already supported:
- successful swaps,
- response rate,
- behavior-specific reviews,
- identity/profile continuity,
- block/report boundaries.

## Deal evidence

Potential layers:
- clear current state,
- both items,
- conversation history,
- confirmations,
- post-deal outcome.

## Translation rule

> **Trust evidence should become more specific as commitment increases.**

Discovery does not need every safety control visible.
A pending real-world meetup may need much more exact context.

---

# 11. REVIEWS — translating outcome → future evidence

Review should feel causally attached to the completed exchange.

Current attributes:
- rating,
- clear description,
- good communication,
- on time,
- respectful swapper.

## Digital behavior

Future review entry should know:
- which Deal produced it,
- who is reviewing whom,
- that the exchange is completed,
- that submission is one-time.

## Trust translation

Do not reduce this to stars everywhere.

Different future surfaces may need different evidence:
- item truth → “clear description” may matter,
- meetup confidence → “on time” may matter,
- social safety → “respectful swapper” may matter.

No final aggregation system is specified yet.

---

# 12. DOLAB — translating the private world

The thesis gives Dolab a system role, not necessarily a navigation role.

## Core behavior to preserve

A private object may be:
- incomplete,
- media-rich,
- note-rich,
- captured from conversation,
- ready but unpublished,
- already published and linked,
- exchanged,
- archived.

## Candidate digital grammar

Instead of generic inventory status, Dolab may eventually organize around **readiness and outward movement**:

```text
captured
→ forming
→ ready
→ in play
→ exchanged / archived
```

These are conceptual translations only. Do not rename backend wire states yet.

## Bidirectional behavior

Conversation → Dolab:
- save something worth keeping/preparing.

Dolab → Conversation:
- share something from my private world intentionally.

This is a distinctive product behavior worth protecting in architecture.

---

# 13. COMMUNICATION — translating why we are talking

A future unified communication surface is allowed only if context remains first-class.

## Direct

Header/context should make clear:
- this is person-to-person,
- request/accepted status where relevant,
- privacy boundary.

## Contextual

Header/context should preserve the originating story/content.

## Deal

Header/context should preserve the exchange pair + current deal state.

## Translation rule

> **Message bubbles may look related. Conversation contracts must not become interchangeable.**

---

# 14. NOTIFICATIONS — translate state changes, not noise

A notification earns existence when it represents meaningful movement in the product loop.

High-value notification classes:
- proposal arrived,
- proposal response,
- Deal created,
- message inside active commitment,
- completion confirmation needed,
- Deal completed,
- trust/outcome action available.

Lower-value social notifications must justify themselves against the thesis.

Notification copy should identify:
- what changed,
- whose action caused it where useful,
- the next relevant action.

---

# 15. MOTION — meaning before animation

No visual motion style is chosen.

Motion may later express **state transition** rather than decoration.

Potential semantic roles:

## Private → public
A contained object crosses into shared space.

## Possibility → proposal
Two separate object identities become visibly related.

## Proposal → Deal
The relationship becomes persistent/shared.

## One confirmation → waiting
Action resolves locally but leaves an incomplete shared state.

## Mutual completion
Shared state closes into history/evidence.

Guardrail:

If motion makes state harder to read, remove it.

---

# 16. GESTURE — native opportunity

No gesture is authorized only because it looks novel.

Gesture candidates must map to existing meaning.

Possible research candidates later:
- long-press / contextual actions on owned private objects,
- drag/select interaction when choosing “what I put forward” in an offer,
- system share → save into Dolab,
- back gesture preserving transaction context,
- media inspection gestures.

Do not implement until prototype stage.

---

# 17. HAPTICS — commitment hierarchy

Haptics should correspond to consequence.

Potential hierarchy:

### Light / low consequence
- selection,
- small state toggle,
- private capture acknowledgment.

### Medium / social consequence
- publish,
- send proposal,
- respond “thinking” / reject where appropriate.

### Strong / shared state change
- accept Offer → Deal created,
- second confirmation → completed.

Exact Android haptic primitives are selected later during implementation testing.

---

# 18. LOADING / EMPTY / ERROR — translate product state

Generic technical copy should be minimized.

## Empty private world

Do not say only “No items.”
The state means:
- nothing captured/prepared yet.

## No public possibilities

Could mean:
- filters/location/desire too narrow,
- no relevant active items,
- network/backend failure.

These should not share one empty UI.

## Offer conflict / 409

This is not generic error.
It means shared state changed elsewhere.

Translation:
> explain that the proposal/item state changed and refresh the relationship.

## Session/network errors

Keep infrastructure failures separate from product-state failures.

---

# 19. ACCESSIBILITY / RTL

Meaning must survive without motion, color or fine visual distinction.

Future system requirements:
- state always available in text/semantics,
- offer pair readable in RTL and accessibility order,
- no reliance on left/right direction alone to mean “mine/theirs”,
- haptics never carry unique information,
- media evidence has meaningful labels where possible,
- commitment actions have exact accessible names,
- touch targets and back behavior follow Android expectations.

---

# 20. Android back / system behavior

The app should preserve conceptual context through native navigation.

Examples for future architecture:
- back from Offer creation should return to the exact requested item context,
- back from Deal conversation should return to the shared Deal/inbox context rather than an unrelated generic tab,
- deep links into deal/offer/profile should reconstruct enough surrounding state to orient the user,
- system notification taps should land on the state object that changed.

The current deep-link model already supports item/deal/offer/profile/direct/contextual/notifications, which is useful evidence for later architecture.

---

# 21. First prototype targets — later

When prototype work begins, do not rebuild the whole app first.

The most revealing narrow slices will be:

### Slice A — Private possession → publication
Proves Mine → Possible threshold.

### Slice B — Item → structured Offer
Proves Possibility → Proposal.

### Slice C — Incoming Offer → Accept → Deal
Proves first commitment threshold.

### Slice D — Deal → one confirmation → mutual completion → Review
Proves Agreement ≠ Completion + trust feedback loop.

### Slice E — Conversation ↔ Dolab
Proves private/public/context bridge.

These slices can later be tested as authored interactions before broad production integration.

---

# 22. Digital Translation result

The thesis now produces concrete behavior without needing an external visual reference.

Core translations:

```text
POSSESSION → POSSIBILITY
= private capture/preparation + intentional publication

PRIVATE ↔ PUBLIC
= visible threshold + no accidental exposure

CERTAINTY IN LAYERS
= progressive evidence near increasing commitment

PROPOSAL AS COMMITMENT
= structured offer object, never generic chat

AGREEMENT ≠ COMPLETION
= Deal coordination + bilateral real-world confirmation

OUTCOME → EVIDENCE
= review/reputation tied to completed exchange
```

**Digital Translation: PASS v0.**

The next gate can now open:

> **Reference Decomposition**

External products/designs may finally be studied — but only for targeted mechanics and compositional lessons against this authored system.

They are not allowed to replace the thesis.
