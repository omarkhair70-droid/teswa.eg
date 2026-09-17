# Teswa — Reference Decomposition v1

**Date:** 2026-09-17  
**Status:** TARGETED REFERENCE PASS — THESIS REMAINS AUTHORITY

## Purpose

The reference gate is now open because Teswa already has an authored thesis and digital translation.

This pass does **not** ask:

> Which marketplace should Teswa look like?

It asks:

> Which existing products have already solved a narrow interaction or state problem that Teswa also has, and what exact lesson can transfer without importing their identity?

Canonical authored Teswa system remains:

```text
MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE
```

Locked principles:

1. Possession → Possibility
2. Private ↔ Public threshold
3. Certainty is earned in layers
4. Agreement ≠ Completion
5. Proposal = first explicit commitment threshold

Every reference below therefore gets:

- **REFERENCE JOB**
- **OBSERVED MECHANIC**
- **TAKE**
- **DO NOT TAKE**
- **TESWA PROBLEM IT CHALLENGES**

No visual language is inherited automatically.

---

# 1. eBay Best Offer — structured proposal state

**Reference job:** understand how a marketplace makes an offer more legible than ordinary chat.

Official behavior observed:

- listings can explicitly allow offers;
- buyer sends an amount and can optionally include a message;
- seller can accept, decline or counter;
- offers/counteroffers have explicit time windows;
- the system tracks the proposal separately from ordinary messages;
- accepted offer does not always mean the item is secured until the next contractual step occurs, depending on the flow/payment state.

Official sources:
- https://www.ebay.com/help/selling/listings/listing-basics?id=4144
- https://www.ebay.com/help/buying/buy-now/making-best-offer?id=4019
- https://ocsnext.ebay.com/help/buying/buy-now/receive-accept-counter-offers?id=4020

## TAKE

### A. Proposal as a state object

The useful lesson is not price negotiation.

It is that an offer has:
- payload,
- sender,
- receiver,
- current status,
- expiry/response state,
- next actions.

That maps strongly to Teswa's typed object-to-object Offer.

### B. Response state must remain explicit

Accept / decline / counter are not buried in generic message chronology.

Teswa's equivalent must preserve:
- pending,
- thinking,
- soft reject,
- accept,
- later backend-verified statuses if they survive archaeology.

### C. Proposal history should survive conversation

A later message should not force users to reconstruct what was originally proposed.

## DO NOT TAKE

- price as the main proposal payload;
- auction mental models;
- seller-business language;
- automatic price thresholds;
- countdown urgency merely because eBay uses expiry;
- payment semantics.

Teswa's current truth is **my active item ↔ your active item**, not amount ↔ item.

## TESWA PROBLEM IT CHALLENGES

> Can Offer remain a durable relationship object while conversation happens around it?

**Verdict:** strong mechanics reference for Offer state architecture; weak identity reference.

---

# 2. Vinted Make an Offer — proposal inside listing + conversation

**Reference job:** study continuity between listing context, conversation and offer action.

Official behavior observed:

- a buyer can start an offer from the listing or from the conversation;
- the seller can accept/reject/counter;
- accepted offer does not itself complete the purchase;
- the item can remain available until the buyer performs the later completion step.

Official source:
- https://www.vinted.com/help/3/258-i-want-to-make-an-offer-or-suggest-a-different-price

## TAKE

### A. Same proposal can be entered from different contexts

An interaction does not need to choose between:
- item detail,
- conversation.

The important thing is preserving the same underlying proposal state.

For Teswa this suggests:
- Offer may originate from Item;
- Offer may remain visible/reviewable inside related conversation;
- both routes should point to one durable Offer identity.

### B. Acceptance and completion can be separate

Vinted provides a useful category-level reminder that accepting a proposal need not mean the physical/transactional outcome is complete.

Teswa's own contract is even stronger:

```text
Offer accepted
→ Deal exists
→ coordination
→ two confirmations
→ completed
```

So Teswa should preserve more stages than Vinted, not fewer.

## DO NOT TAKE

- price-centric negotiation;
- item purchase checkout semantics;
- generic fashion resale identity;
- offer limits as product drama;
- conversation UI as visual template.

## TESWA PROBLEM IT CHALLENGES

> Can the user move between object context and person context without losing the Offer as the central commitment object?

**Verdict:** strong continuity reference, not a structural blueprint.

---

# 3. OfferUp — digital agreement → physical meetup → inspection

**Reference job:** study the seam between online proposal and real-world handoff.

Official behavior observed:

- buyers make offers on listings;
- sellers accept/decline/counter through messaging;
- after acceptance, participants coordinate a meetup;
- users are explicitly told to inspect the item in person before completing purchase;
- the service provides/suggests designated Community MeetUp Spots in supported markets;
- safety guidance tells users to inspect profiles, ratings, listing quality and responsiveness before meeting.

Official sources:
- https://help.offerup.com/hc/en-us/articles/360031993392-How-to-buy-on-OfferUp
- https://help.offerup.com/hc/en-us/articles/360032334451-Accept-an-offer
- https://help.offerup.com/hc/en-us/articles/360032330891-Safety-tips-for-meeting-up
- https://help.offerup.com/hc/en-us/articles/360032335691-About-Community-MeetUp-Spots

## TAKE

### A. The handoff is a first-class product stage

OfferUp does not pretend the product ends at digital acceptance.

It explicitly enters:
- meeting,
- inspection,
- practical coordination.

This strongly supports Teswa's locked principle:

> Agreement ≠ Completion.

### B. Trust evidence becomes more relevant near meetup

Before physical interaction, profile/reputation/listing quality/response behavior matter more.

That reinforces Teswa's principle:

> certainty is earned in layers.

### C. Location can be an action, not just metadata

The useful lesson from MeetUp Spots is not the US-specific police/business network.

The deeper lesson:

> location can become a shared coordination object inside the transaction.

This is materially better than treating distance only as a discovery filter.

## DO NOT TAKE

- US-specific safety infrastructure as if it transfers to Egypt;
- price-only offer structure;
- freeform message as sufficient contract state;
- star rating as the whole trust model;
- any assumption that Teswa can certify a meetup as safe.

## TESWA PROBLEM IT CHALLENGES

> What must the Deal surface become once two people need to turn digital agreement into a physical exchange?

**Verdict:** strongest current reference for the REAL stage of Teswa's spine.

---

# 4. eBay / Depop Drafts — private state is legitimate

**Reference job:** test the idea that an object can exist inside the product before becoming public.

Official behavior observed:

- eBay allows listing drafts to be saved and resumed later;
- Depop lets users save a listing as a draft and return to publish later;
- Depop drafts can move between app and web;
- draft is treated as an intentional workflow state, not simply a failed publish.

Official sources:
- https://www.ebay.com/help/selling/listings/creating-listing?id=4105
- https://www.ebay.com/help/selling/selling/ebay-profile-page?id=5185
- https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item
- https://depophelp.zendesk.com/hc/en-gb/articles/8608273715217-Listing-on-web

## TAKE

### A. Draft is a legitimate object state

This supports Teswa's private/public threshold.

But Teswa should go deeper than these references because Dolab can hold:
- notes,
- media,
- exchange intent,
- saved conversation material,
- unpublished objects.

So Teswa's private world is not merely “unfinished listing form.”

### B. Capture and publish do not need to be one session

Useful interaction principle:

> capture now; prepare later; publish intentionally.

This creates space for native Android share/camera/audio entry points into MINE.

## DO NOT TAKE

- merchant inventory terminology;
- long form-first seller workflow;
- business dashboard information architecture;
- draft expiry rules;
- assumption that every private object is destined to become a listing.

## TESWA PROBLEM IT CHALLENGES

> Can MINE feel like a real personal exchange workspace rather than a staging folder for unfinished public listings?

**Verdict:** use drafts as minimum baseline; Teswa must author a richer private state.

---

# 5. Airbnb — trust evidence depends on the threshold

**Reference job:** study progressive trust and the difference between verification and certainty.

Official behavior observed:

- Airbnb uses identity verification as one trust signal;
- its own documentation explicitly says verification does not guarantee that a person is who they say they are;
- profiles combine identity/reputation/context signals;
- before booking, a limited profile can be shown rather than every personal detail;
- reviews and verification participate at different moments in the relationship.

Official sources:
- https://www.airbnb.com/help/article/1237
- https://www.airbnb.com/help/article/3386
- https://www.airbnb.com/help/article/3143

## TAKE

### A. Verification is evidence, not certainty

This is exactly compatible with Teswa's authored trust principle.

Do not build one giant “trusted” badge that claims more than the system knows.

### B. Reveal evidence according to the decision

Airbnb's limited pre-booking profile is a useful reference for progressive disclosure.

Teswa equivalent questions:
- discovery: what is enough to judge interest?
- before Offer: what evidence is enough to propose?
- before acceptance: what person/item evidence is relevant?
- before meetup: what safety/coordination evidence matters now?

### C. Person evidence and transaction evidence can coexist

Trust does not need to live only on the profile page.

## DO NOT TAKE

- travel-booking semantics;
- identity verification requirements as an automatic Teswa requirement;
- profile completeness as a gamified score;
- Airbnb's visual identity;
- centralized “platform guarantees trust” language.

## TESWA PROBLEM IT CHALLENGES

> Which evidence belongs near each increasing commitment threshold?

**Verdict:** strongest reference for trust architecture, not for marketplace structure.

---

# 6. Android Predictive Back + Material navigation — context continuity should feel native

**Reference job:** prevent Teswa from rebuilding web-style navigation inside a native app.

Current Android guidance:

- predictive back lets users preview where the back gesture will take them;
- Android 15+ enables core predictive back system animations for opted-in apps;
- Navigation Compose supports predictive back behavior;
- Material components such as SearchBar and ModalBottomSheet support predictive back when using current Material3 versions.

Official sources:
- https://developer.android.com/develop/ui/compose/system/predictive-back-setup
- https://developer.android.com/guide/navigation/custom-back/support-animations
- https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture

## TAKE

### A. Back should reveal destination, not surprise the user

This maps directly to Teswa's context-heavy journeys:
- Offer creation → requested item;
- Deal thread → Deal context;
- item deep link → surrounding discovery state where available.

### B. System navigation is part of authored experience

Native quality is not only custom motion.

Using Android's own back model well can create more confidence than decorative transitions.

### C. Shared context can animate when semantically justified

A shared item/object transition may later help users understand:
- “this is the same object I just acted on,”
not merely make the app feel premium.

## DO NOT TAKE

- custom predictive-back animation before navigation semantics are stable;
- gestures that compete with system edge gestures;
- back interception at root that breaks system behavior;
- motion as brand performance.

## TESWA PROBLEM IT CHALLENGES

> Can the app preserve relationship context through navigation without making users reconstruct where they came from?

**Verdict:** mandatory native baseline, not optional polish.

---

# 7. Cross-reference synthesis

The useful patterns are now surprisingly consistent.

## Pattern A — private state is real

References:
- eBay drafts
- Depop drafts

Teswa translation:

```text
MINE is not a failed public listing.
```

Teswa must go further because Dolab already supports private notes/media/conversation capture.

## Pattern B — proposals deserve structure

References:
- eBay Best Offer
- Vinted offers
- OfferUp offers

Teswa translation:

```text
Offer = durable relationship object
not chat text
```

Teswa should go further because its payload joins two owned objects rather than one object and a price.

## Pattern C — acceptance is not necessarily the end

References:
- Vinted
- OfferUp
- Teswa's own contract

Teswa translation:

```text
accept
→ shared Deal
→ physical coordination
→ bilateral completion
```

Teswa's contract is richer than the references here and should remain richer.

## Pattern D — trust changes with consequence

References:
- Airbnb
- OfferUp safety/meetup guidance

Teswa translation:

```text
light evidence at exploration
→ deeper evidence before proposal
→ stronger context before meetup
→ outcome evidence after completion
```

## Pattern E — location becomes meaningful when action gets physical

Reference:
- OfferUp MeetUp Spots

Teswa translation:

Location may need two roles:
- feasibility during discovery;
- shared coordination context after Deal creation.

Do not reduce it to “Nearby” or a map tab.

## Pattern F — native navigation can carry meaning

Reference:
- Android predictive back / Navigation Compose

Teswa translation:

Back, deep links and transitions should preserve which object/relationship/state the user is returning to.

---

# 8. What none of these references solves for Teswa

This is the important part.

No reference above fully solves:

## A. OBJECT ↔ OBJECT PROPOSAL

Most mature references negotiate money against an item.

Teswa currently proposes:

```text
my thing ↔ your thing
```

This relationship needs its own interaction language.

## B. PRIVATE WORKSPACE ↔ PUBLIC MARKET ↔ SHARED DEAL

Draft systems exist.
Marketplaces exist.
Deal/chat systems exist.

But Dolab creates a stronger possibility:

```text
private personal material
→ intentionally public object
→ shared relationship state
→ outcome/history
```

No reference should flatten that.

## C. BILATERAL PHYSICAL COMPLETION

Many commerce products observe payment/shipping completion themselves.

Teswa often depends on human confirmation of a real-world event.

That requires authored state language and feedback.

## D. EVIDENCE THAT CHANGES BY RELATIONSHIP

Teswa has object evidence, person evidence, Deal evidence and post-outcome evidence.

A generic profile trust score would destroy this structure.

---

# 9. First architecture implications earned by references

These are now strong enough to carry into Experience Architecture v0.

### 1. MINE must be reachable without forcing publication

Private capture/preparation is a first-class journey.

### 2. Item detail cannot be only a product page

It must expose enough of:
- object truth,
- owner openness,
- person evidence,
- proposal readiness.

### 3. Offer needs a dedicated state representation

It may appear inside several surfaces, but it should have one durable identity.

### 4. Deal must retain the exchange pair

Conversation can sit inside the Deal; Deal cannot disappear into conversation.

### 5. Trust evidence should attach to decisions

Not one universal “trust section”.

### 6. Location changes role after acceptance

Before: relevance/effort.
After: coordination/handoff.

### 7. Navigation should return users to relationships, not tabs

Deep links/back behavior should reconstruct semantic context.

---

# 10. Reference verdict matrix

| Reference | Exact job | TAKE | DO NOT TAKE |
|---|---|---|---|
| eBay Best Offer | proposal state | durable offer object, explicit responses/history | money/auction identity |
| Vinted Offer | item ↔ conversation continuity | same offer accessible across contexts; accepted ≠ finished | fashion resale/price semantics |
| OfferUp | real-world handoff | meetup/inspection as product stage; location becomes shared action | US-specific safety infrastructure |
| eBay/Depop Drafts | private-before-public | save/prepare/publish later | merchant inventory model |
| Airbnb | layered trust | threshold-specific evidence; verification ≠ certainty | travel identity/verification policy |
| Android Predictive Back | native context continuity | system-first back/deep-link semantics | decorative/custom navigation tricks |

---

# 11. Gate result

**Reference Decomposition v1: PASS.**

The references did not replace Teswa's thesis.

They sharpened six mechanics:

```text
PRIVATE STATE IS LEGITIMATE
STRUCTURED PROPOSAL SURVIVES CHAT
ACCEPTANCE OPENS A NEW SHARED STATE
PHYSICAL HANDOFF IS A PRODUCT STAGE
TRUST EVIDENCE DEEPENS WITH CONSEQUENCE
NATIVE NAVIGATION PRESERVES CONTEXT
```

The next gate is now open:

> **TESWA EXPERIENCE ARCHITECTURE v0**

That architecture must be built from:

```text
MINE
→ POSSIBLE
→ BETWEEN US
→ REAL
→ EVIDENCE
```

—not from the existing tab bar and not from any one reference product.