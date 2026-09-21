# TESWA BETWEEN US — PRODUCTION CLOSURE 01

**Date:** 2026-09-21  
**Status:** IMPLEMENTATION COMPLETE — VALIDATION / DEVICE CANDIDATE PENDING  
**Parent anchor:** `TESWA_ANCHOR_03_BETWEEN_US_V1_2026-09-17.md`

## Product law

BETWEEN US is not a message inbox.

It is the place where:

`two people / two objects → one relationship`

The durable visual law is:

`TWO THINGS + ONE RELATION`

Offer, accepted deal, direct request, direct conversation and contextual reply may all live under BETWEEN US, but they must not collapse into one generic row grammar.

## First real-device/code audit

The native root already grouped the right semantic entities, but contradicted the anchor in two important ways:

1. the root exposed a generic mode bar:
   `النشاط / العروض / الصفقات / مباشر / ردود`;
2. active Deals were still visually closer to inbox rows than durable exchange relationships.

## Slice 01 implemented

- removed the generic root mode picker;
- BETWEEN US root now remains one combined semantic hub;
- Offers / Deals / Direct / Contextual are drill-down destinations only after selecting a relationship;
- Android back from a drill-down returns to the BETWEEN US root;
- root masthead uses live relationship summary instead of a permanent philosophy paragraph;
- active Deal cards now lead with the exchange pair geometry;
- participant identity is explicit;
- next-action copy outranks chat preview;
- direct requests/messages use person identity instead of a fake object relation;
- empty state uses the BETWEEN US mark as the learnable relation metaphor.

## Immediate next closure slices

1. Offer → Deal continuity: acceptance must visually settle the same pair rather than jumping to a disconnected surface.
2. Deal room: persistent exchange header, completion asymmetry and next-action truth.
3. Direct request: request boundary → accepted direct space without turning BETWEEN US into WhatsApp.
4. Contextual replies: preserve the originating story/entity context.
5. History: quiet archival relation trace, not another active list.
6. Real-device review and exact versioned Internal candidate.

## Rejection rules

Reject any implementation that becomes:

- a tabbed inbox;
- WhatsApp with swap icons;
- order-management rows;
- status-pill-first UI;
- two item names separated only by `↔`;
- a Deal represented primarily by its latest chat message.

## Closure checkpoint 02 — relationship workflow complete in code

### Root

- BETWEEN US is one semantic hub; there is no permanent inbox-mode tab bar.
- Needs-you, waiting, active relation, conversation and history states are composed in one root.
- completed/cancelled/disputed Deals move to **أثر اللي حصل** rather than competing with active relations.
- contextual rows carry the originating story trace instead of a generic “reply” label.

### Offer → Deal

- accepting an Offer preserves the same requested/offered pair on screen;
- accepted Offer exposes the transition into the Deal without inventing a disconnected success world;
- requested/offered images are carried into Deal summaries and room header;
- the visual relation stays one continuous pair from offer → active deal → history.

### Deal Room

- persistent object-pair header remains above coordination chat;
- next action reflects coordination vs one-sided confirmation vs completion;
- each participant confirmation is represented independently;
- completion updates the selected Deal **and the BETWEEN US inbox state immediately**;
- completed rooms become evidence/history surfaces and stop exposing the coordination composer;
- review is the only post-completion forward action;
- Deal messaging intentionally remains **text + voice**: archaeology confirms richer chat actions belong to Direct, while Deal is a coordination surface.

### Direct

- request gate remains explicit and text-first;
- accepted Direct uses the richer native message contract;
- replies, reactions, typing state, semantic deletion and reporting are wired;
- private attachments support image / video / file, max 5 per message and 50 MB each;
- attachment flow is transactional: upload → message commit, with OCI rollback on failure;
- image attachments have an in-app full-screen viewer;
- video/files open from short-lived signed URLs;
- Direct chat media signed reads are authorized for both conversation participants;
- explicit Dolab pull/save bridges remain intact.

### Contextual / story replies

- Contextual intentionally stays text + voice instead of cloning Direct;
- each conversation persists a snapshot of the story that created it:
  caption, media type/path, author and creation time;
- old conversations are backfilled when the story still exists;
- the story origin is visible in root and remains pinned above the thread;
- story image origin supports full-screen viewing; video origin opens through a signed private URL;
- contextual participants retain authorized read access to snapshotted story media after story expiry while the object still exists;
- if media is later physically removed, caption/type/time still preserve the reason the conversation exists.

### Trust / safety

- Deal messages, Direct messages and Contextual messages all have message-level reporting;
- Contextual reporting validates conversation participation, message membership and sender identity;
- Contextual reports are represented explicitly in moderation storage and admin filtering;
- all report UI routes through the existing centralized ReportingDialog.

### Regression proof already added

- Offer acceptance continuity test;
- Deal item image continuity test;
- Direct native replies/attachments/reactions contract tests;
- Direct rich attachment envelope test;
- Direct media participant authorization test;
- Contextual snapshot contract test;
- Contextual story-media authorization test;
- Deal completion → root-state propagation test;
- Contextual message reporting Android + Oracle tests.

## Remaining gates before device candidate

1. latest exact-head **Android Native Foundation** must be green;
2. **Between Us Oracle Contracts** must be green for media/contextual/moderation Python contracts;
3. version bump to the next immutable candidate (**versionCode 34 / 1.0.18**);
4. signed Internal Testing publication;
5. real-device review of root → offer → deal → direct → contextual → history.

No speculative feature expansion should occur before these gates. Any new change must correspond to a concrete failing contract or real-device regression.
