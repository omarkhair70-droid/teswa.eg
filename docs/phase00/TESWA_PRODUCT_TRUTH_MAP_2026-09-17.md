# Teswa Phase 00 — Product Truth Map

**Date:** 2026-09-17  
**Status:** REALITY EXTRACTION — THESIS NOT YET LOCKED

## Purpose

Before redesigning Teswa, separate **what the product actually lets people do** from the screen structure inherited from older versions.

This document is not a sitemap and not a design brief.

It asks:

> What relationships, commitments, uncertainties and value exchanges actually make Teswa a product?

The answers below are grounded first in the current Native/Oracle implementation and existing product architecture. Hypotheses are marked as hypotheses and must survive later source research and real-user/product evidence.

---

# 1. What is already observable in the native product

The current native shell exposes or wires real capability around:

- Home
- Discover
- Add Item
- Item detail/opening
- Offers
- Deals
- Messages
- direct conversation
- contextual conversation
- voice media
- profiles / public profiles
- People
- Follow / social relationships
- Reviews
- Notifications
- Stories
- Dolab
- location / Nearby / motion-location discovery
- edit listing
- reporting / safety
- settings

The native deep-link model explicitly recognizes:

- `/item/{id}`
- `/deal/{id}`
- `/offer/{id}`
- `/profile/{id}`
- `/direct/{id}`
- `/contextual/{id}`
- `/notifications`

The bottom shell currently exposes Home, Discover, Add, Messages and Profile. That is **implementation evidence only**. It is not automatically the final information architecture.

---

# 2. The product is not the current tab bar

Teswa should not be reduced to:

- a marketplace feed
- a five-tab mobile shell
- a social app with listings
- an OLX/Facebook Marketplace clone
- a set of cards plus chat
- a grid of second-hand products

Those descriptions name surfaces. They do not explain why offers, contextual messages, deals, Dolab, trust and discovery need to coexist.

Phase 00 treats the current UI as a probe into product behavior, not as the product definition.

---

# 3. Reality loops already present

## Loop A — POSSESS → PRESENT

A person has something and makes it legible to other people.

Observed product capability:

`owned thing → add item → media/details/location → published item`

Important questions for later research:
- What makes an owner decide an item is available?
- Is the item unwanted, underused, replaceable, collectible, emotionally attached to, or simply worth testing against the market?
- What information makes the item feel real enough to another person?

The meaningful unit is not “create listing UI.”

It is:

> **turn a private possession into a publicly negotiable possibility.**

## Loop B — DISCOVER → WANT

A person encounters something they did not own and develops enough interest to act.

Observed capability:

`Home / Discover / Nearby / People / Stories → item or person → attention → action`

The product already contains multiple discovery modes, which suggests discovery is broader than exact search.

Open question:

> Is Teswa strongest when users arrive knowing what they want, or when it creates unexpected desire from what is available around them?

Do not answer from old UI.

## Loop C — SIGNAL VALUE → OFFER

Teswa contains explicit offer behavior rather than only a fixed “buy now” path.

Observed capability:

`item → offer → owner response / conversation → possible deal`

This introduces a product truth that ordinary catalog commerce does not have:

> **value can require a proposal before it becomes an agreement.**

Do not yet assume the final metaphor is “barter,” “bidding,” or “negotiation.” The exact mechanics must be read from the real offer/deal contracts and user behavior.

## Loop D — CONTEXT → CONVERSATION

Teswa distinguishes direct and contextual communication.

That matters.

A conversation about an item/deal is not identical to a generic DM. Context can carry:
- what object is being discussed
- what offer exists
- what stage the interaction is in
- what commitment may happen next

Working product relationship:

`interest → context → conversation → clarification / negotiation → action`

The UI should eventually preserve meaningful context rather than flatten every interaction into one generic chat surface.

## Loop E — PROPOSAL → DEAL

Deals exist as their own route/state.

That implies a threshold:

`possible exchange → proposal understood by both sides → accepted/active deal state`

Later product work must identify the exact states and what each side believes has happened at each transition.

A “deal” must not be treated as a decorative success screen.

It is a change in social/product commitment.

## Loop F — STRANGER → TRUSTED ENOUGH

The native product contains:
- public profiles
- reviews
- follow/block relationships
- reporting
- safety surfaces
- account/profile state

That means trust is not external to the marketplace. It is part of the product.

Working relationship:

`unknown person → evidence → confidence / caution → interaction → outcome → new evidence`

The design problem is not “show a star rating.”

It is:

> What evidence lets two people move from uncertainty to enough confidence for the next action?

## Loop G — LOCATION → PRACTICAL POSSIBILITY

Teswa contains location/Nearby behavior.

Distance can alter whether an otherwise attractive item is realistically actionable.

Working relationship:

`desire × distance × effort → practical opportunity`

Location should therefore not automatically become a map gimmick. It may be a constraint, filter, confidence signal, discovery source or handoff factor depending on the real journey.

## Loop H — DOLAB → PERSONAL INVENTORY

Dolab is more interesting than a renamed profile grid if it represents a person's available possessions / collection / exchangeable inventory.

Working question:

> Is Dolab a personal identity surface, an inventory surface, a staging area for exchange, or a combination with a clear hierarchy?

Do not keep it just because the feature exists. But do not flatten it into “My Listings” before understanding its product role.

## Loop I — ACTIVITY → RETURN

Notifications, stories, follows, messages and offer/deal activity create reasons to return.

This does not automatically mean “Teswa is social media.”

Later research must distinguish:
- product-critical return loops
- trust/community reinforcement
- discovery enrichment
- social features that are only engagement residue

Anything that does not strengthen the core product may be demoted or removed.

---

# 4. Product tensions exposed by current reality

These are **questions to research**, not final creative principles.

## FIXED VALUE ↔ SUBJECTIVE VALUE

A listed object can have factual attributes, but an offer/deal model suggests its actionable value may depend on the two people and the moment.

## OWNERSHIP ↔ RELEASE

The owner already has the thing. Teswa begins before commerce: at the decision that this possession may leave, trade, or change status.

## WANT ↔ WHAT I HAVE

A marketplace built around offers can connect desire to available personal inventory, not only money to a price tag.

## STRANGER ↔ TRUST

Every exchange begins with incomplete knowledge about the other person and the object.

## DISCOVERY ↔ INTENT

Some journeys may start with search; others with surprise, proximity, a person, a story, or an item seen incidentally.

## POSSIBILITY ↔ COMMITMENT

Viewing is cheap. Offering, messaging, accepting and completing a deal progressively increase commitment.

## OBJECT ↔ PERSON

Items matter, but the person behind the item matters too. Profiles/reviews/conversations are not separate decoration around commerce.

## LOCAL ↔ BROAD DISCOVERY

Nearness can improve feasibility while broader discovery improves possibility.

## SOCIAL ENERGY ↔ TRANSACTIONAL CLARITY

Stories/follows/people can make the product alive; offers/deals/messages need exact state and trust. The system must know when to be expressive and when to become precise.

---

# 5. Working product layers

This is a **reality model**, not final navigation.

## Layer 1 — OBJECT

The thing itself:
- media
- condition/details
- owner
- location/context
- availability/state

## Layer 2 — POSSIBILITY

Can this object become relevant to me?
- discovery
- desire
- fit
- distance
- availability

## Layer 3 — PROPOSAL

What am I willing to do to obtain it?
- offer
- counter/response where supported
- contextual message
- clarification

## Layer 4 — COMMITMENT

Has possibility become a recognized deal/state?
- accepted offer/deal
- agreed next action
- explicit status

## Layer 5 — TRUST

What evidence changes willingness to proceed?
- identity/profile
- history/reviews
- social relationship
- reporting/blocking/safety

## Layer 6 — PERSONAL WORLD

What do I bring into Teswa?
- my items / Dolab
- my identity
- my activity
- my relationships
- my offers/deals/messages

---

# 6. Current feature status: do not confuse existence with importance

Phase 00 uses four product labels before any UI rebuild:

### CORE
Without it Teswa's central exchange loop breaks.

### SUPPORT
Improves feasibility, trust or continuity of the core loop.

### DISCOVERY / SOCIAL
Can deepen the product, but must prove it strengthens Teswa rather than generic engagement.

### CHALLENGE
Exists today but must re-earn its place in the future architecture.

Initial hypothesis only:

- Items / Add / Item Detail — CORE
- Offers / Deals — CORE
- contextual communication — CORE
- Messages / Direct — CORE or SUPPORT depending journey
- Profile / public profile / trust / reviews — SUPPORT, potentially CORE to safe exchange
- Dolab — potentially CORE identity/inventory concept; requires truth research
- Discover / Nearby — CORE discovery capability, final form open
- Notifications — SUPPORT
- edit listing — SUPPORT/utility
- reporting/blocking — SUPPORT/safety requirement
- Stories — DISCOVERY/SOCIAL, must re-earn exact role
- Follow / People — DISCOVERY/SOCIAL, must re-earn exact role
- Motion/City Pulse-style discovery — CHALLENGE until its product value is demonstrated

No feature is deleted from this hypothesis alone.

---

# 7. What Phase 00 refuses to decide yet

Do not choose yet:

- final Home structure
- final bottom navigation
- card vs non-card presentation
- visual identity
- palette
- typography
- motion language
- whether Stories survive
- whether Follow becomes central or peripheral
- whether Dolab is a main destination
- whether discovery is feed/search/map/spatial/editorial/hybrid
- whether offer mechanics should feel like bargaining, matching, proposing, or something else
- a final public product tagline

These are outputs of later meaning and architecture work.

---

# 8. First product-truth hypotheses to test

These are deliberately provisional.

### H1 — Teswa is about activating dormant value

A possession that is static for one person can become useful/desirable to another.

### H2 — Teswa's distinctive unit may be the proposal, not the listing

The interesting moment may begin when another person says what the item is worth **to them** and what they are willing to offer/do.

### H3 — Trust is part of value

An objectively attractive item may be a bad opportunity if person/context/distance/condition cannot support confidence.

### H4 — Personal inventory may be product identity

Dolab could make “what I own / what I am willing to move” part of identity, rather than profiles being generic social bios.

### H5 — The product may be strongest at the transition from possession to possibility

Teswa may not fundamentally be about browsing products; it may be about causing objects to change hands/status through human proposals.

None of H1–H5 is accepted as the thesis yet.

---

# 9. Next research gate

Before UI references, Phase 00 must study the source world behind these product tensions:

- how people decide what possessions are worth keeping vs releasing
- subjective value and non-fixed value
- offers / counteroffers / reciprocity
- trust under incomplete information
- condition/evidence and object truth
- personal collections / wardrobes / inventories
- local distance and exchange friction
- commitment thresholds between browsing, talking, proposing and agreeing
- the cultural language around “worth”, “swap”, “deal”, “my things” and “your things” in the actual intended user context

Only after that research should we reduce the field into a small Meaning System.

# Exit condition

This document is successful when future design can discuss Teswa in **relationships and state changes**, not in old route names and screenshots.
