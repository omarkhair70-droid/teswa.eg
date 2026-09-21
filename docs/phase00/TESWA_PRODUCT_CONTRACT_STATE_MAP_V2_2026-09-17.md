# Teswa Phase 00 — Product Contract State Map v2

**Date:** 2026-09-17  
**Branch:** `audit/native-product-reality-20260917`  
**Status:** CONTRACT-VERIFIED PRODUCT REALITY — NO UI THESIS YET

## Why this document exists

The first Product Truth Map described Teswa in relationships rather than screens. This pass verifies those relationships against the current Native/Oracle contracts so we stop designing around assumptions.

This is not a screen spec.

It answers:

> What state changes does Teswa actually recognize today, what is reversible, what becomes commitment, and what product meaning is already encoded in those contracts?

Primary evidence read in this pass:

- `android-native/.../feature/additem/AddItemModels.kt`
- `android-native/.../feature/offers/OfferModels.kt`
- `android-native/.../feature/offers/OffersRepository.kt`
- `android-native/.../feature/messages/MessagingModels.kt`
- `android-native/.../feature/messages/MessagingRepository.kt`
- `android-native/.../feature/direct/DirectModels.kt`
- `android-native/.../feature/direct/DirectRepository.kt`
- `android-native/.../feature/contextual/ContextualModels.kt`
- `android-native/.../feature/contextual/ContextualRepository.kt`
- `android-native/.../feature/dolab/DolabModels.kt`
- `android-native/.../feature/dolab/DolabRepository.kt`
- `android-native/.../feature/dolab/DolabPublishBridge.kt`
- `android-native/.../feature/dolab/DolabDirectMessagingBridge.kt`
- `android-native/.../feature/profile/ProfileModels.kt`
- `android-native/.../feature/profile/ProfileRepository.kt`
- `android-native/.../feature/reviews/ReviewModels.kt`
- `android-native/.../feature/reviews/ReviewRepository.kt`
- `android-native/.../feature/safety/ReportingModels.kt`

---

# 1. Core exchange state machine — current product truth

The current product is not a generic listing/chat flow.

The actual contract is much closer to:

```text
PRIVATE POSSESSION / IDEA
        ↓
DOLAB DRAFT / READY
        ↓
PUBLISHED MARKETPLACE ITEM (active)
        ↓
ANOTHER USER SELECTS THAT ITEM
        ↓
THEY SELECT ONE OF THEIR OWN ACTIVE ITEMS
        ↓
OFFER: requested item ↔ offered item
        ↓
OWNER RESPONDS
  ├─ thinking
  ├─ soft reject
  └─ accept
        ↓
DEAL CREATED
        ↓
COORDINATION / DEAL MESSAGES
        ↓
PARTICIPANT A CONFIRMS COMPLETION
        ↓
PARTICIPANT B CONFIRMS COMPLETION
        ↓
DEAL COMPLETED
        ↓
REVIEW / REPUTATION EVIDENCE
```

This is the first major contract lock:

> **Teswa currently models exchange as a sequence of explicit thresholds, not as one continuous generic chat.**

---

# 2. Publishing is already richer than “make a listing”

## Observed add-item contract

A new marketplace item can carry:

- 1–4 images
- title
- category
- city / area
- optional coordinates
- condition
- condition notes
- description
- item story
- swap reason
- “good for”
- desire mode
- desire text

`DesireMode` is explicitly:

- `specific`
- `flexible`
- `surprise`

This is unusually important product evidence.

The owner is not only describing **what this object is**. The contract also lets them describe **what kind of possibility they are open to**.

Observed relationship:

```text
object truth + owner intent + desired possibility
```

That is stronger than a conventional catalog record.

## Product consequence

Future item representation should not assume that title/photo/condition are the full truth of a listing.

There are at least three semantic layers already present:

1. **OBJECT** — what is it?
2. **EVIDENCE** — what condition / story / media supports the claim?
3. **OPENNESS** — what kind of exchange is the owner actually open to?

This does **not** yet decide layout or visual hierarchy.

---

# 3. Marketplace item lifecycle has history and constraints

Observed marketplace listing states:

- `active`
- `reserved`
- `swapped`
- `archived`

Owner actions currently support:

- archive
- reactivate
- delete archived

But lifecycle actions are constrained:

- an item with open offers cannot simply be archived
- an item with deal history cannot be permanently deleted
- reactivation requires an archived state
- permanent deletion requires an archived state

Contract meaning:

> **Once other people have acted on an item, that item gains history that the owner cannot treat as if it never happened.**

This matters later for information architecture and object identity.

A used item is not just a card that disappears when hidden. It can become part of offer/deal/reputation history.

---

# 4. Offer mechanics are now verified

## Preconditions for sending an offer

The native client verifies that:

- requested item ID is valid
- requested item exists
- requested item status is `active`
- requested item belongs to another user
- communication is not blocked in either direction
- sender selects from their own active marketplace items

The creation payload is:

```text
requestedItemId
+ offeredItemId
+ senderId
+ receiverId
+ optional message
```

## Important correction to earlier hypotheses

The current client contract is **one requested item ↔ one offered item**.

It does **not** currently create:

- multi-item bundles
- cash top-ups
- arbitrary price bids
- freeform counteroffer packages

Those may exist as future product ideas or external-market behavior, but they are **not current Teswa product truth**.

## Offer states recognized by the model

- `pending`
- `thinking`
- `accepted`
- `soft_rejected`
- `redirected`
- `withdrawn`
- `expired`
- `cancelled_after_accept`

Current incoming actionable states are only:

- `pending`
- `thinking`

Current native receiver actions are:

- `THINKING`
- `SOFT_REJECT`
- `ACCEPT`

There is no current native action here for creating a `redirected` state, withdrawing, expiring, or cancelling after acceptance. Those statuses therefore need backend/history investigation before they can be used as future UX primitives.

## Product meaning

The contract distinguishes three very different responses:

```text
not yet → thinking
no → soft reject
yes → accept
```

That gives Teswa more social nuance than a binary accept/decline system.

The `thinking` state is especially meaningful because it preserves possibility without pretending that no decision has happened.

---

# 5. Accepting an offer is a real threshold

When an offer is accepted, the server response must return a `dealId`.

The native client then treats that deal as a separate object and emits notifications for deal creation.

So the real transition is not:

```text
message → more messages
```

It is:

```text
offer accepted
→ new deal identity exists
→ coordination context opens
```

Locked contract principle:

> **Acceptance creates a new shared object between two people: the deal.**

That is a product threshold and should eventually feel different from casual exploration.

---

# 6. Deal state is coordination plus mutual completion

A deal inbox row carries:

- deal identity
- status
- requested item
- offered item
- other participant
- latest message
- unread count
- last activity

Deal communication supports:

- text
- voice
- read state

Completion is only allowed from current client logic when the deal status is one of:

- `coordinating`
- `completed_pending_confirmation`

The completion flow is explicitly two-sided:

```text
user A confirms
→ confirmation stored
→ /complete checks whether exchange is complete
→ if not complete, user B is notified

user B confirms
→ /complete returns completed=true
→ both participants receive completion notice
```

This is important:

> **Teswa does not treat completion as a unilateral “mark sold” action. It treats completion as mutual confirmation of a shared event.**

That is much stronger product meaning than a generic status dropdown.

---

# 7. Reputation is downstream of a real completed exchange

The review contract is deal-bound.

A review is unavailable before deal completion.

A review can contain:

- 1–5 rating
- comment
- clear description
- good communication
- on time
- respectful swapper

Duplicate review submission is rejected.

This gives us a strong trust truth:

> **Reputation evidence is supposed to come from an exchange relationship that actually crossed the completion threshold.**

The four behavior signals are also more meaningful than an isolated star number because they point to different kinds of uncertainty:

- was the object represented clearly?
- was communication good?
- did the person show up / respect time?
- was the person respectful as a swap participant?

Future trust design should preserve that causal link instead of turning reputation into decorative social proof.

---

# 8. Teswa currently has three different communication systems

This is not implementation noise. The contracts encode different social meanings.

## A. Direct conversation

Direct messaging is person-to-person and request-gated.

Recognized conversation states:

- `requested`
- `accepted`
- `ignored`
- `blocked`

The receiving user can accept or ignore a request.

Privacy/blocking can prevent conversation creation or sending.

Meaning:

```text
person → asks for access to person
```

## B. Contextual conversation

Current contextual conversations are specifically tied to `story_reply` context.

They preserve:

- story/context entity
- starter
- recipient
- participant
- messages
- unread state

Meaning:

```text
content/event → creates conversation context
```

## C. Deal conversation

Deal messaging only exists after an accepted exchange proposal created a deal.

Meaning:

```text
shared commitment object → coordination conversation
```

## Product consequence

Do **not** flatten these into “Chat” merely because all three render messages.

They differ in why the conversation exists:

```text
DIRECT      = I want to talk to you
CONTEXTUAL  = I am responding to this thing you shared
DEAL        = we have an accepted exchange to coordinate
```

The future inbox can unify navigation if useful, but it must not erase these semantic differences.

---

# 9. Dolab is materially deeper than “My Listings”

The current Dolab contract has its own lifecycle:

- `draft`
- `ready`
- `published`
- `exchanged`
- `archived`

Only `draft` and `ready` are editable inside Dolab.

A Dolab item can contain:

- title
- description
- category
- condition
- exchange intent
- media
- notes
- source
- linked published marketplace item ID

A Dolab item can exist **before** marketplace publication.

That makes Dolab a private product layer, not merely a filtered list of public listings.

## Additional evidence: Dolab can absorb conversation material

Current native bridge behavior can save a direct message into Dolab:

- text message → Dolab item with `source = "note"`
- voice message → Dolab item with `source = "voice"` plus uploaded audio

## Additional evidence: Dolab can feed conversation material back out

Current bridge behavior can load Dolab items and notes as shareable material inside direct messaging.

That means the relationship is bidirectional:

```text
private personal world
↔ conversation
↔ public exchange possibility
```

This is much more interesting than “inventory management.”

## Updated Dolab hypothesis

Previous hypothesis:

> Dolab may be personal inventory / identity.

Contract-verified stronger hypothesis:

> **Dolab is currently the closest thing Teswa has to a private exchange workspace: a place where possessions, notes, media, intent and captured conversation can exist before or beyond publication.**

Still not a locked product thesis, but Dolab has now earned a much deeper research priority.

---

# 10. Trust is distributed, not one feature

Current trust/safety evidence appears across multiple contracts.

## Profile evidence

A profile can expose:

- successful swaps count
- response rate
- city / area
- identity fields
- own active/history listings

## Completed-deal evidence

Reviews can expose behavior after actual completed exchanges.

## Safety evidence

Reporting distinguishes targets such as:

- user
- item
- story
- direct message
- deal
- deal message

Report reasons include:

- misleading item
- spam offer
- unsafe behavior
- no-show
- harassment
- fraud
- inappropriate content

This is useful product evidence because the risk vocabulary changes by context.

For example:

- `misleading_item` belongs to object truth
- `no_show` belongs to real-world coordination
- `spam_offer` belongs to proposal/conversation behavior
- `fraud` can cross item/person/deal layers

Product consequence:

> **Trust cannot be reduced to a badge on a profile. Teswa's own safety model already says trust failures occur at different layers of the exchange.**

---

# 11. The strongest verified product loop now

After reading the contracts, the strongest observed loop is:

```text
I HAVE SOMETHING
→ I MAKE IT LEGIBLE
→ I DECLARE WHAT KIND OF EXCHANGE I AM OPEN TO
→ SOMEONE DISCOVERS IT
→ THEY PUT ONE OF THEIR OWN ACTIVE THINGS AGAINST IT
→ I RESPOND
→ ACCEPTANCE CREATES A SHARED DEAL
→ WE COORDINATE
→ BOTH CONFIRM REAL-WORLD COMPLETION
→ THE OUTCOME BECOMES TRUST EVIDENCE
```

This is substantially more specific than “second-hand marketplace.”

---

# 12. What this kills immediately

The following design assumptions are now rejected unless new evidence overturns them.

## KILL — “Teswa is basically a catalog with DMs”

False against current contracts.

## KILL — “Chat is one generic destination”

False. Direct, contextual and deal conversation have different causes and states.

## KILL — “Review is generic social engagement”

False. It is tied to completed exchange history.

## KILL — “Dolab equals My Listings”

False. Dolab contains private unpublished state, notes/media and conversation capture/share behavior.

## KILL — “Offer equals text negotiation”

False. Offer is a typed object-to-object proposal with explicit states.

## KILL — “Completing a deal is one person's action”

False. Current contract requires bilateral confirmation logic.

## KILL — “The owner only describes the item”

False. Owner intent/desire mode is already in the publication model.

---

# 13. What remains unverified

Do not invent answers for these yet.

## Offer backend-only statuses

Need contract/backend archaeology for:

- `redirected`
- `withdrawn`
- `expired`
- `cancelled_after_accept`

Questions:
- what creates each state?
- are they legacy, active, scheduled, or future?
- does `redirected` imply an abandoned counteroffer concept?

## Marketplace `reserved`

Need exact backend transition ownership.

Question:
- does accept automatically reserve both items?
- can another open offer remain actionable?
- when does `swapped` become authoritative?

## Dolab `ready`

Need exact rule that changes draft → ready.

Question:
- is readiness user-declared, validation-derived, or publication-prep state?

## Public profile trust aggregation

Need exact contract for:
- review aggregation
- response-rate calculation
- successful swap count
- block/follow graph

## Story/social survival

Contextual story replies prove stories have product behavior today. They do not prove Stories deserve a central future role.

## Location

Coordinates/city/area exist in item creation and discovery infrastructure, but Phase 00 still needs evidence for how much location changes successful exchange behavior.

---

# 14. Product hypotheses after contract verification

## H1 — “Dormant value”

**Status:** survives, but still too broad.

The contracts clearly support possessions moving from private state to public exchange and completed outcome. The phrase itself is not yet differentiated enough to become the thesis.

## H2 — “Proposal is the atomic unit”

**Status:** strengthened, but needs refinement.

Offer is a real typed object with state and consequence. However, Teswa begins before the offer: private possession, desire/opening, discovery and trust all matter.

So “proposal” may be the atomic unit of **commitment**, not of the whole product.

## H3 — “Trust is part of value”

**Status:** strongly strengthened.

The product contract ties object evidence, person history, communication, no-show/fraud reporting, bilateral completion and post-deal review together.

## H4 — “Personal inventory is identity”

**Status:** incomplete wording, but Dolab is strongly strengthened.

Dolab is not only public inventory. It behaves more like a private personal exchange workspace.

## H5 — “Possession → possibility”

**Status:** strongly strengthened.

Current contracts repeatedly encode the transition from owned/private object to published possibility to proposal to shared outcome.

---

# 15. Meaning Extraction gate status

The gate is **closer but not fully locked**.

Before writing the authored Teswa thesis, Phase 00 needs one more source pass focused on:

- Egyptian physical used-object behavior
- local inspection / condition / meetup reality
- actual language around swapping, worth, “my stuff”, release and fairness
- value difference and perceived fairness
- whether people think item-for-item, item-plus-money, or simply “what feels fair”
- how stigma / pride / thrift / necessity vary by category
- how location changes willingness to act

Then Meaning Extraction can aggressively reduce this field into a small number of principles.

---

# Current conclusion

The current Native/Oracle implementation already contains a coherent product skeleton beneath its provisional UI:

> **private possession → declared openness → object-to-object proposal → explicit response → shared deal → mutual real-world confirmation → reputation**

And Dolab introduces a second, potentially defining layer:

> **private personal exchange world ↔ public exchange world**

These relationships now outrank the old route tree as product truth.
