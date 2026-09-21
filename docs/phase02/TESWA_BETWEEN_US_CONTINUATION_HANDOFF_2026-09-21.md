# TESWA BETWEEN US — CONTINUATION HANDOFF

**Date:** 2026-09-21  
**Repository:** `omarkhair70-droid/teswa.eg`  
**Branch:** `audit/native-product-reality-20260917`  
**PR:** #526 — **Draft / Unmerged**  
**Validated checkpoint:** `e7e52020668c24999a01660458f806fdd84acb03`

## Do not restart

Continue directly from the live repository. GitHub is the source of truth.

Do **not**:
- redesign BETWEEN US from scratch;
- restore a generic inbox/tab model;
- reopen Dolab product work without a concrete regression;
- add speculative chat features before the device candidate;
- merge PR #526 just because this surface is green.

## Previous root closure

Dolab is product-closed.

Final Dolab candidate:
- versionCode **33**
- versionName **1.0.17**
- Google Play Internal publication: **SUCCESS**
- no further Dolab visual review is required unless a real regression appears.

## BETWEEN US — current product truth

BETWEEN US is not a generic message inbox.

`two people / two objects → one relationship`

Durable visual law:

`TWO THINGS + ONE RELATION`

The root is one semantic hub. Offer / Deal / Direct / Contextual are relationship types and drill-downs, not permanent root tabs.

## Implementation complete in code

### Root
- permanent inbox-mode tabs removed;
- live relational summary;
- active/waiting/needs-you/history composed together;
- completed/cancelled/disputed relations move to quiet history;
- contextual rows preserve story origin.

### Offer → Deal
- accepted offer keeps the same requested/offered pair;
- accepted state settles in place before entering the Deal;
- object images carry through into Deal summaries and room header;
- one visual relationship continues from Offer → Deal → history.

### Deal Room
- persistent exchange-pair header above coordination chat;
- next action reflects coordination vs pending confirmation vs completion;
- each side confirms independently;
- completion immediately updates root/inbox state;
- completed Deal becomes evidence/history, not an active chat workflow;
- review is the only forward post-completion action;
- Deal chat intentionally remains **text + voice** because its job is coordination, not becoming Direct.

### Direct
- explicit request boundary;
- native rich message contract restored;
- replies;
- reactions;
- typing state;
- semantic deletion;
- message-level reporting;
- image/video/file attachments;
- max 5 attachments/message;
- max 50 MB/attachment;
- transactional attachment upload with OCI rollback on failed message commit;
- image full-screen viewer;
- video/file signed-url opening;
- both participants authorized to read `direct_chat_media`;
- Dolab pull/save bridges preserved.

### Contextual
- remains intentionally text + voice;
- story-origin snapshot persisted:
  caption / media type / media path / author / created-at;
- origin remains visible above the thread and in BETWEEN US root;
- image origin supports full-screen;
- video origin opens through signed private URL;
- contextual participants retain authorized access to snapshotted story media after story expiry while the object still exists;
- fallback context survives if the media object is physically removed;
- contextual messages now have message-level reporting.

### Safety
- Deal / Direct / Contextual all support message-level reports;
- Contextual moderation verifies:
  conversation participation,
  message membership,
  reported sender identity;
- contextual report columns + admin filtering added;
- all Android report flows use the central ReportingDialog.

## Validation — green

Validated checkpoint:

`e7e52020668c24999a01660458f806fdd84acb03`

- **Android Native Foundation #296** — SUCCESS
  - run id: `35564210910`
- **Between Us Oracle Contracts #2** — SUCCESS
  - run id: `35564210864`

The Oracle workflow covers the touched media/contextual/moderation Python modules and their targeted unit tests.

## Exact continuation point

**Do not add another feature slice now.**

Next action:

1. verify current live branch/head before writing;
2. bump Android candidate to:
   - versionCode **34**
   - versionName **1.0.18**
3. create an immutable Internal release branch from the validated implementation;
4. publish signed AAB to Google Play Internal Testing;
5. perform the first full real-device BETWEEN US walk:
   - root;
   - incoming offer;
   - accept offer;
   - enter same Deal relation;
   - text + voice coordination;
   - one-side completion;
   - two-side completion;
   - history;
   - Direct request → accepted Direct;
   - Direct reply/reaction/typing/delete;
   - image/video/file attachment send + receive + viewer;
   - Dolab pull/save inside Direct;
   - Contextual story reply;
   - pinned story origin;
   - story image/video origin;
   - Contextual voice;
   - message reporting;
   - offline/network/session-expiry spot checks.
6. fix only concrete regressions found on device;
7. record the final device-accepted closure checkpoint.

## Canonical docs

- `docs/phase02/TESWA_ANCHOR_03_BETWEEN_US_V1_2026-09-17.md`
- `docs/phase02/TESWA_BETWEEN_US_PRODUCTION_CLOSURE_01_2026-09-21.md`
- this handoff

## Product rejection rules

Reject any regression toward:
- a tabbed inbox;
- WhatsApp with swap icons;
- order-management rows;
- status-pill-first hierarchy;
- Deal represented mainly by latest chat preview;
- Contextual thread losing its story origin;
- Direct attachments becoming public or cross-conversation readable.

This handoff is the continuation point for the next chat.
