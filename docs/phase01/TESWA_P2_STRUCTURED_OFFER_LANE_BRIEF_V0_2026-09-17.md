# Teswa Phase 01 — P2 Structured Offer Lane Brief v0

**Date:** 2026-09-17  
**Branch:** `audit/native-product-reality-20260917`  
**Status:** LANE OPEN — STATIC/STATE PROTOTYPE BEFORE PRODUCTION UI

## Why P2 is first

The authored product thesis is now stable enough to test at the first consequential threshold:

```text
POSSIBLE
→ PROPOSAL
→ BETWEEN US
```

Current Teswa contract is exact:

```text
I WANT: one active item owned by another person
I PUT FORWARD: one active item owned by me
OPTIONAL: message
RESULT: a durable Offer object with explicit state
```

This makes P2 the best first lane because it forces the new system to prove several principles at once:

- **Possession → Possibility** — my possession can become the answer to another person's public possibility.
- **Private ↔ Public** — only an already-public/active item from Mine can participate in the current contract.
- **Certainty in layers** — enough object/person evidence must remain accessible before commitment.
- **Proposal = first explicit commitment threshold** — sending is socially and product-wise consequential.
- **Context travels with commitment** — requested item and offered item cannot disappear once the user enters the proposal flow.

The current `OfferCreationScreen.kt` is useful behavioral proof, not a design baseline. It currently presents a conventional vertical form: requested-item card → heading → selectable list of owned-item cards → optional text field → send button. That works as plumbing, but it does not yet author the object-to-object relationship as the main composition.

---

# 1. Lane question

> **How can Teswa let a person place one of their possessions against another person's possession so that the relationship is immediately understood — without turning the interaction into checkout, a price bid, or generic chat?**

This is the only problem P2 needs to solve.

---

# 2. Non-negotiable product truths

## Requested object stays present

The thing the user wants must remain visually recoverable throughout selection and send confirmation.

Do not make the user remember what they opened before entering the flow.

## Offered object stays equally legible after selection

Once selected, the user's object stops being a row in a list and becomes one half of a proposal.

## Relationship outranks individual cards

The core visual unit is not:

```text
card
card
button
```

It is:

```text
THEIR THING
      ↕ proposal relationship
MY THING
```

The layout must make the relation legible even if images fail.

## Sending is a threshold

Before the final action, the composition must allow a last read of:

- what I want,
- what I am putting forward,
- who receives it,
- optional context/message,
- what sending creates.

## Message is subordinate

A message can explain the proposal.
It is not the proposal.

## No invented economics

Do not introduce:
- prices,
- valuation meters,
- fairness scores,
- cash top-ups,
- bundle counts,
- algorithmic equivalence.

The current Teswa contract is one active object ↔ one active object.

---

# 3. Reference jobs for this lane

References are now allowed only because Teswa already has its own thesis.

## Steam Trade Offers — strongest structural reference

**Reference job:** understand two-sided inventory selection where the relationship between what each side contributes is the main object.

Official Steam Support describes a trade offer flow where users choose items from both inventories, put them into trade boxes, review trade contents, confirm, and make the offer.

### TAKE

- explicit separation of the two sides;
- the trade contents are reviewable as one shared proposition;
- confirmation happens after composition of the exchange, not during each item selection;
- inventory remains a source from which the proposal is composed.

### DO NOT TAKE

- desktop drag-and-drop as the required mobile interaction;
- dense game-inventory grid aesthetics;
- rarity/color semantics;
- multi-item trade bundles — current Teswa contract is one-for-one;
- Steam security/market chrome as identity.

### Teswa translation

Use the **two-sided proposition** lesson, not the Steam look.

---

## eBay Best Offer — proposal as durable state object

**Reference job:** understand how a proposal remains separate from ordinary messaging and carries explicit next actions/state.

Official eBay behavior separates Best Offer from messages and supports explicit accept/decline/counter/expiry states.

### TAKE

- proposal has its own state and history;
- receiver responses are explicit;
- optional message is secondary payload;
- state can change while the underlying item remains understood.

### DO NOT TAKE

- money/price as the main payload;
- auction pressure;
- countdown urgency unless Teswa backend explicitly requires it;
- checkout/payment semantics.

---

## Vinted — action continuity from item to offer/conversation

**Reference job:** preserve continuity between an item, an offer action, and communication around the item.

Current Vinted listing surfaces can expose `Buy now`, `Make an offer`, and `Ask seller` from the same item context; Vinted's current terms also explicitly distinguish acceptance of a price counteroffer from actual completed purchase.

### TAKE

- the item's identity remains the anchor when action changes;
- offer and conversation can be adjacent without becoming the same thing;
- accepted proposal and completed outcome are distinct states.

### DO NOT TAKE

- commerce CTA stack;
- buyer-protection/payment framing;
- conventional marketplace listing hierarchy as Teswa's visual identity.

---

## Android Predictive Back / shared continuity — native behavior reference

**Reference job:** make entering and leaving the offer lane preserve spatial/contextual continuity.

Android's Predictive Back lets users preview where back navigation will return, and Navigation Compose can support shared-element transitions.

### TAKE

- back should reveal/recover the requested-item context rather than feel like closing a detached form;
- object identity can persist across navigation using authored shared transitions later;
- sheets can be used for secondary selection without replacing the primary relationship composition.

### DO NOT TAKE

- animation for decoration;
- custom back interception that breaks native expectations.

---

# 4. Lane thesis

> **AN OFFER IS TWO POSSESSIONS HELD IN ONE FRAME BEFORE THEY BECOME SHARED STATE.**

Internal interaction phrase:

> **PUT MINE AGAINST THEIRS.**

This phrase is not public copy.

The composition should move through three semantic states:

```text
1. THEIR POSSIBILITY
      ↓
2. CHOOSE WHAT OF MINE ANSWERS IT
      ↓
3. THE PROPOSAL EXISTS AS A PAIR
```

The user should feel the moment when their item stops being merely inventory and becomes an explicit answer to the other item.

---

# 5. Static composition requirements

The first static prototype must contain five regions, but they must not read like five form sections.

## A. Requested object anchor

Always visible or easily recoverable.

Required minimum:
- image/evidence preview,
- title,
- owner identity cue,
- owner openness/desire cue when available.

## B. Relationship field

A visual zone whose sole job is to make `theirs ↔ mine` legible.

It must work:
- before selection,
- after selection,
- with images missing,
- in RTL,
- with TalkBack reading order.

## C. Mine selector

Before selection this is inventory access, not the final proposal.

Candidate behavior:
- horizontal/stacked chooser,
- modal bottom sheet,
- dedicated selector surface that returns the chosen object into the relationship field.

Do not show the entire private Dolab by default. Current contract should source only eligible active public items.

## D. Optional context

Message remains collapsible/subordinate.

The default composition should still make perfect sense with no message.

## E. Commitment action

The action label must describe consequence, not merely generic “Continue”.

Before enabling:
- requested object valid,
- one owned active item selected.

Before final send the user should see the actual pair.

---

# 6. State set the prototype must render

The prototype is incomplete unless all of these static states exist:

### S0 — ENTRY
Requested item visible; no owned item selected.

### S1 — SELECTING MINE
Owned active items visible in selection context; requested item remains anchored.

### S2 — PAIR FORMED
Requested + offered item now read as a single proposal object.

### S3 — WITH OPTIONAL MESSAGE
Pair remains primary while message/context is attached.

### S4 — SENDING
No layout collapse; proposal remains visible while action is pending.

### S5 — SENT / PENDING
The resulting Offer becomes an explicit state object; next action is to follow the proposal, not a generic success screen.

### E0 — NO ELIGIBLE MINE
Explain that the user has nothing currently eligible to put forward and route toward preparing/publishing something from Mine.

### E1 — SHARED STATE CHANGED
409/conflict means the requested/offered item's state changed; treat it as product-state change, not a generic network error.

---

# 7. Composition anti-patterns

Reject immediately if the prototype becomes:

- a long form with the pair separated by scrolling;
- two generic Material cards plus a swap icon;
- a checkout summary;
- a dating-app swipe metaphor;
- an auction/bid panel;
- a dense marketplace grid;
- a chat composer with item attachments;
- a decorative balance scale implying Teswa calculated fairness;
- drag-and-drop that is inaccessible or required for basic operation.

---

# 8. First authored composition direction

## DIRECTION A — THE PAIR FIELD

Use one continuous compositional field rather than two unrelated cards.

Conceptual anatomy:

```text
[ THEIR OBJECT — dominant evidence ]

       a visible relationship seam
       "أنت عايز دي"
             ↕
       "وهتحط دي قدامها"

[ YOUR SELECTED OBJECT / EMPTY SLOT ]

[ optional note ]

[ SEND PROPOSAL ]
```

The “empty slot” is not a blank card. It is an invitation to bring one eligible possession from Mine into the proposition.

Once chosen, the seam should visually tighten: the two objects now belong to one temporary proposal composition.

Why this direction leads:
- it translates the thesis directly;
- it keeps object identity stronger than form chrome;
- it can later support a meaningful state transition animation;
- it does not require copying Steam/eBay/Vinted layouts;
- it remains feasible in Jetpack Compose.

---

# 9. Motion hypothesis — not yet implementation

Potential transition after selecting Mine:

```text
my item chosen in selector
→ selector recedes
→ chosen object enters the Pair Field
→ relationship seam resolves from open/dashed to explicit
→ send action becomes available
```

Meaning:

> my possession has become an answer to their possibility.

Do not animate for spectacle.

---

# 10. Haptic hypothesis — not yet implementation

Selection itself: low consequence / light acknowledgement.

Proposal fully formed: no celebratory haptic needed.

Final Send: medium consequence acknowledgement after durable creation succeeds, not on button-down.

Offer accepted belongs to a later lane and may deserve a stronger shared-state transition.

---

# 11. Real-device acceptance questions

When this lane eventually reaches a device, verify:

- Can I state the two objects in the proposal after a one-second glance?
- Can I go back without losing where I came from?
- Can I change my selected item without mentally rebuilding the whole proposal?
- Does the message look optional rather than required?
- Is Send clearly more consequential than selecting an item?
- Can I understand S0/S2/S5 without color?
- Does RTL reading order preserve `requested → offered → action` meaning?
- Does the screen still work with long Arabic titles and no images?

---

# Gate

**P2 Lane Brief: PASS v0.**

Next artifact:

> `TESWA_P2_STATIC_STATE_COMPOSITIONS_V0_2026-09-17.md`

Only after static/state composition survives review should this lane move into authored Compose interaction code.