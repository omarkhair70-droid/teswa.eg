# Teswa Intelligence v1 — Product Map

Date: 2026-09-13
Base branch: `chore/oracle-runtime-cutover-prep-20260910`
Planning branch: `plan/teswa-intelligence-v1-20260913`
Master tracker: #509

## Decision

Teswa Intelligence v1 will **not** ship as one isolated "AI feature" such as Similar Items.

The product direction is one shared intelligence layer that spreads through the marketplace experience:

> **Teswa understands what people have, what they want, and who should meet.**

Engineering work is split into safe internal lanes and feature flags, but the user-facing target is **one coherent release** where listing, search, matching, offers, Home/Discover, and opportunity notifications become smarter together.

This is separate from, but complementary to, the Share Anywhere distribution loop in #504:

> `List once on Teswa → Share anywhere → Discover anywhere → Deal on Teswa`

---

## 1. Current product truth from the repo

### Home
`app/(tabs)/home.tsx`

Today Home combines:
- account next-action logic,
- offer/message/listing counters,
- personal "what changed since last visit" signals,
- stories,
- short product video moments,
- latest marketplace items.

The current next action is deterministic rule logic. It is useful, but not a learned marketplace ranking system.

### Discover
`app/(tabs)/discover.tsx`
`lib/discover-intelligence.ts`

Today Discover supports:
- normal marketplace pagination,
- nearby items,
- text query,
- category filter,
- condition filter,
- story highlights,
- video moments,
- a heuristic Spotlight layer.

Current text search is local substring matching over title/category/location. The current `discover-intelligence` module is rule/scoring logic based on content completeness, story/video presence and filters. It is **not ML/AI**.

### Add Item
`app/(tabs)/add.tsx`

Today Add Item is a strong manual six-step flow:
1. photos,
2. details,
3. condition,
4. story/context,
5. desired exchange,
6. review.

It already captures high-value fields for intelligence:
- title,
- category,
- location,
- condition + notes,
- description,
- item story,
- swap reason,
- good-for context,
- desire mode,
- desire text,
- wanted tags,
- up to multiple images plus optional video teaser.

It also supports drafts and Dolab → listing handoff.

### Item Detail
`app/item/[id].tsx`

Today item detail already exposes:
- item imagery/video,
- title/description/category/condition/location,
- owner identity/trust signals,
- desire text and wanted tags,
- share item / share card,
- official `Start swap offer` CTA.

This means AI can enhance the existing product model instead of inventing a parallel marketplace.

### Offer creation
`app/offer/create/[itemId].tsx`

Today offer creation:
- loads the requested item,
- loads the viewer's active items,
- makes the user manually choose one item to offer,
- optionally adds a message,
- creates an official swap offer.

This is the most important immediate AI opportunity: **rank the user's own items by how good a reciprocal match they are for the requested item.**

### Messages / deals
`app/(tabs)/messages.tsx`, `app/deal/*`, `app/direct/*`, `app/contextual/*`

Teswa already separates:
- direct conversations,
- deal conversations,
- story/contextual conversations,
- formal offers.

Intelligence v1 does **not** need to read private message bodies to be useful.

### Profile / social / stories / motion
The product already has profiles, trust/presence signals, listings, stories, follows and motion/video discovery. These are useful recommendation surfaces/signals, but they should not become independent AI systems.

### Analytics
`lib/analytics.ts`

Existing event infrastructure already tracks important product events such as:
- home viewed,
- item detail viewed,
- item create/publish,
- offer started/sent/action,
- deal room/message,
- notification opened,
- story viewed,
- profile viewed.

Intelligence v1 should extend this event vocabulary instead of creating a second telemetry stack.

---

## 2. Teswa Intelligence v1 — user-visible capabilities

## A. Listing Intelligence

Surface: Add Item + Dolab publish handoff.

From product photos, Teswa should suggest:
- category,
- concise title,
- useful tags,
- visually supportable attributes,
- optional short description seed,
- photo quality warnings,
- likely duplicate/reused image signal.

Rules:
- suggestions only; user can edit/reject,
- never silently publish,
- do not claim authenticity, price/value, or exact condition from vision alone,
- manual listing remains fully functional if AI is unavailable.

## B. Semantic + Visual Search

Surface: Discover.

Replace "substring only" search with hybrid retrieval:
- normal text/filters,
- semantic text search,
- visual/image search,
- vector similarity,
- location/category/condition constraints.

Examples:
- `عايز شنطة صغيرة للجامعة` should work even if exact words are not in the title.
- a photo should retrieve products that actually resemble it.

Search must remain usable when AI is unavailable by falling back to the current deterministic search.

## C. Item Intelligence

Surface: Item Detail.

Do not stop at generic `Similar Items`.

Show useful intelligence such as:
- items visually/semantically related to this one,
- likely exchange opportunities,
- why an item may fit the owner's wanted intent,
- active alternatives when the current item is unavailable.

A generic category-based similar-items rail is not enough to count as the intelligence launch.

## D. Swap Matching Engine — core Teswa identity

This is the center of Intelligence v1.

Given user A's item X and user B's item Y, estimate whether the pair is a useful swap opportunity by combining permitted signals such as:
- product semantic/visual compatibility,
- A's wanted/desire intent,
- B's wanted/desire intent,
- category/tags,
- locality,
- availability,
- freshness,
- marketplace behavior signals,
- prior accepted/completed swap patterns once enough real data exists.

The goal is **reciprocal matching**, not just image similarity.

### Hard filters before ranking
Never rank a candidate that is:
- the same user's own item on the opposite side,
- inactive/archived/deleted,
- hidden/moderated/private,
- blocked by user relationship rules,
- unavailable for offer creation.

### Output
The match service should return a versioned score plus explainable product signals, for example:
- `strong reciprocal intent`,
- `close category/visual fit`,
- `same area`,
- `owner is flexible about exchange`.

Do not show fake precision such as `97.31% perfect match` unless it is actually calibrated.

## E. Offer Intelligence

Surface: `app/offer/create/[itemId].tsx`

When a user wants item Y, Teswa should rank the user's own active items:

> **Best things from your Dolab/listings to offer for this item**

Target UX:
- top 3 recommended items first,
- remaining active items below,
- short "why this may fit" explanation,
- optional message draft based only on item/deal context,
- user still makes the final choice and sends the offer.

This is more valuable to Teswa than launching Similar Items alone.

## F. Home + Discover Opportunity Ranking

Surface: Home and Discover.

Home should evolve from mostly newest/activity ordering toward a blend of:
- strongest swap opportunities,
- explicit wanted intent,
- user taste,
- freshness,
- locality,
- exploration/diversity,
- marketplace availability.

Discover should become the deeper search/exploration surface; Home should surface the best next opportunities.

Keep non-personalized fallback ranking for cold-start users and AI outages.

## G. Opportunity Notifications

Use the same match engine; do not build a separate recommendation model.

Examples:
- `ظهر عنصر قريب جدًا من اللي بتدور عليه.`
- `عندك حاجة ممكن تناسب صاحب العنصر ده.`
- `في فرصة تبديل قوية ظهرت في منطقتك.`

Requirements:
- threshold + cooldown,
- deduplication,
- notification preferences respected,
- no spam loop,
- measure open → offer-start → completed-swap outcomes.

## H. Duplicate / Quality Intelligence

Use image fingerprints + embeddings to flag:
- exact image reuse,
- cropped/resized/edited near-duplicates,
- suspicious repeated listing media,
- very poor/blank/irrelevant product photos.

This is a **signal**, not an automatic fraud verdict or ban.

## I. Share Anywhere handoff intelligence

#504 remains its own product/growth lane.

Once an external visitor lands on a public item, intelligence can optionally help with:
- relevant alternatives,
- related swap opportunities after login,
- preserving the original item intent into onboarding/login.

The public page itself must remain fast and useful even if AI is down.

---

## 3. What AI must NOT control

Teswa Intelligence may control **understanding, ranking, retrieval, matching and suggestions**.

It must not autonomously control:
- authentication/session validity,
- accepting/rejecting an offer on behalf of a user,
- finalizing a deal,
- deleting accounts/items,
- bans/moderation verdicts,
- private-message surveillance,
- claims about authenticity/value/medical/legal/safety facts,
- any irreversible action without existing deterministic authorization rules.

Private DMs are not required as an Intelligence v1 training/ranking source.

---

## 4. Shared architecture

Target shape:

```text
Teswa App
   ↓
Existing Teswa Backend / Oracle runtime
   ↓
Teswa Intelligence API
   ├─ item understanding / embedding runtime
   ├─ semantic search + vector retrieval
   ├─ reciprocal match scorer
   └─ ranking / opportunity service
   ↓
PostgreSQL + pgvector + existing item/offer/analytics data
   ↓
Existing media/object storage
```

### Important architecture rule
Do not put model calls directly in individual screens.

All screens call stable Teswa-owned contracts. That lets us change model families later without rewriting product surfaces.

### Model candidates
The first benchmark should compare a small number of strong pretrained candidates rather than pick a model by brand name:
- OpenCLIP / CLIP-family or SigLIP-family for joint image-text retrieval,
- DINOv2-family where pure visual structure / near-duplicate behavior is useful,
- a multilingual text strategy that is tested specifically on Arabic marketplace queries.

The winner is chosen by Teswa evaluation data, latency and operational cost — not hype.

### CPU/GPU
Initial development and small-scale inference can be CPU-first where practical. GPU is introduced only where latency/training volume justifies it.

---

## 5. Core data model additions

At minimum, plan versioned records for:

### Item intelligence
- item id,
- image/media identity,
- visual embedding,
- optional text/combined embedding,
- model version,
- source fingerprint,
- status (`pending`, `ready`, `failed`, `stale`),
- created/updated timestamps.

### Intent representation
Derived from explicit marketplace data first:
- desire mode,
- desire text,
- wanted tags,
- categories interacted with,
- high-intent actions (offer started/sent, accepted/completed swap).

### User taste representation
Only after enough interaction exists. Version it and make it rebuildable.

### Match result
- requested item,
- offered candidate item,
- scorer/model version,
- score or band,
- reason codes,
- calculated time,
- expiry/staleness strategy.

Do not store unnecessary raw private content inside vector/match tables.

---

## 6. Evaluation before claims

### Listing Intelligence
Measure:
- category top-1 / top-k,
- suggestion accept/edit/reject rate,
- failure classes.

### Search
Create Arabic marketplace query cases and image-query cases; measure retrieval quality (Recall@K / NDCG or an equivalent documented ranking metric).

### Swap Matching
Create a human-reviewed set of item pairs:
- strong reciprocal match,
- one-way match only,
- visually similar but bad exchange,
- unrelated,
- blocked/unavailable.

Measure whether useful candidates appear in top K.

### Personalization / opportunity ranking
Compare against current deterministic/newest baselines using:
- relevant item open rate,
- offer-start rate,
- offer-send rate,
- accepted/completed swap contribution,
- notification open → action rate.

No "AI improves conversion" claim without a measured comparison.

---

## 7. One-release strategy without unsafe big-bang engineering

User-facing target: **one Teswa Intelligence v1 release**.

Internal delivery is staged behind feature flags:

### Lane A — Foundation
- intelligence service,
- embeddings,
- pgvector,
- versioning,
- async jobs,
- evaluation harness.

### Lane B — Item understanding
- listing suggestions,
- image quality/duplicate signals,
- Dolab/listing handoff support.

### Lane C — Search + retrieval
- semantic search,
- visual search,
- hybrid filtering,
- item-related retrieval.

### Lane D — Swap Matching + Offer Intelligence
- reciprocal match scorer,
- rank user's offerable items,
- reason codes,
- opportunity retrieval.

### Lane E — Home / Discover personalization
- taste profile,
- candidate generation,
- ranking,
- cold-start fallback.

### Lane F — Opportunity notifications
- match trigger,
- threshold/cooldown,
- telemetry.

### Lane G — Integrated launch hardening
- shadow mode,
- feature flags,
- regression suite,
- latency/load checks,
- release build,
- real-device smoke.

### Shadow mode
Before visible rollout, allow the new intelligence layer to compute results without changing UI. Compare its rankings against existing behavior and the evaluation set.

### Launch gate
The integrated release ships only when:
- deterministic marketplace flows still work with AI disabled,
- all new AI surfaces have fallbacks,
- no hidden/deleted/moderated data leaks through vector retrieval,
- match/search evaluation reaches documented minimums,
- p95 latency is acceptable for interactive endpoints,
- async inference does not block normal listing publication,
- real-device tests cover Add → Discover → Item → Offer → Deal and opportunity notification paths.

---

## 8. Priority product experience for the launch demo

A strong Intelligence v1 demo should feel like one connected brain:

1. User photographs an item.
2. Teswa suggests listing structure.
3. Item is published and embedded/indexed.
4. Another user searches naturally or discovers it through personalized ranking.
5. Teswa understands the owner's wanted intent.
6. On `Make an offer`, Teswa ranks the viewer's own items by reciprocal fit.
7. The user sends the best offer.
8. A later strong opportunity can trigger a useful notification.

That is a materially stronger story than `we added Similar Items`.

---

## 9. Issue map

Existing:
- #504 Share Anywhere
- #505 Visual AI foundation
- #506 Listing Intelligence
- #507 Discovery / visual search / duplicate detection
- #508 Personalization
- #509 Master tracker

Add:
- **Swap Matching + Offer Intelligence** issue
- **Integrated Intelligence v1 rollout** issue

Then update #509 so Swap Matching is a first-class core capability rather than an afterthought.

---

## 10. Definition of Teswa Intelligence v1

Teswa Intelligence v1 is done when we can truthfully demonstrate, in the production-shaped app:

- photos become useful listing suggestions,
- text/image queries retrieve meaningfully relevant items,
- the system represents explicit wanted intent,
- it finds reciprocal swap opportunities,
- offer creation ranks the user's own items by fit,
- Home/Discover can use the same intelligence safely,
- strong opportunities can trigger controlled notifications,
- AI outages do not break the marketplace,
- every visible claim has evaluation or product evidence behind it.

The identity is not "Teswa has AI".

The identity is:

> **Teswa understands the item, the intent, and the opportunity.**
