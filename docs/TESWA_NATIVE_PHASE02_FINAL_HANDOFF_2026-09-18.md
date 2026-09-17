# TESWA Native Phase 02 — Final Continuation Handoff

**Date:** 2026-09-18  
**Repository:** `omarkhair70-droid/teswa.eg`  
**Working branch:** `audit/native-product-reality-20260917`  
**PR:** #526 — *Define Teswa product truth and one native production experience system*  
**PR state:** Draft, Open, Unmerged  
**Base:** `feat/native-foundation-network-20260915`

---

## 0. READ THIS FIRST

This document is the continuation entrypoint for the next chat/session.

The work in this branch is **not a prototype, not a parallel visual lab, and not a reduced Teswa**. It is the real native Android Teswa product, keeping the existing auth/backend/product capabilities while rebuilding the product architecture and visual language end-to-end.

Do **not** restart the design process from scratch. Do **not** return to generic Material screens. Do **not** restore the old Expo UI wholesale. Do **not** merge PR #526 merely because CI is green.

The next product gate is **Google Play Internal Testing on a real device**.

---

## 1. CURRENT IMMUTABLE IMPLEMENTATION CHECKPOINT

The latest code checkpoint that must be treated as the Internal-Test candidate is:

- **Commit:** `d46bb53d1a572f8162b0e0b0d62f3821f30ad5e7`
- **versionCode:** `28`
- **versionName:** `1.0.12`
- **applicationId / Play package:** `com.teswa.mobile`
- **Release API:** `https://core01.tail6afd9b.ts.net`

Why versionCode 28:
- versionCode 27 was already consumed by an earlier Google Play Internal Testing upload.
- Google Play version codes are immutable/reusable only once, so this candidate was deliberately bumped to 28.

### CI proof

Android Native Foundation **run #210**:
- Run ID: `35284158616`
- Result: **SUCCESS**
- Unit tests: PASS
- Debug Kotlin compile: PASS
- Release Kotlin compile: PASS
- Release Android lint: PASS
- Debug APK build: PASS
- Debug AAB build: PASS
- Artifact upload: PASS

The immediately previous full design-closure checkpoint was:
- `1899583143bf6ce254f9065b1d9e8dbd3ca10b75`
- Foundation run #209: SUCCESS

The only functional source change after that checkpoint was the versionCode bump to 28.

---

## 2. PRODUCT TRUTH — DO NOT DILUTE

Canonical thesis:

> **Teswa turns what people already own into possibilities between them — carrying each possibility from private possession, through evidence and proposal, into a real exchange that both people confirm.**

Product spine:

`MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE`

Internal art-direction sentence:

> **OBJECTS WITH A PAST — OBJECTS WITH A NEXT.**

Meaning:
- the object is not a SKU;
- it came from somebody’s life;
- Teswa opens a next possibility for it;
- digital agreement is a commitment to meet reality, not a claim that reality already happened;
- accepted offer != completed swap;
- completion is bilateral;
- evidence comes after the real-world outcome.

The old Expo product had authored personality but unclear product hierarchy.  
The first native redesign had much stronger product architecture but became too generic/systemic.  
**Phase 02 deliberately combines the strengths: clear exchange logic + authored Teswa identity.**

---

## 3. VISUAL SYSTEM STATUS

Structural system:
- **EXCHANGE FIELD** = product / IA / states / semantic architecture.

Art direction:
- **OBJECTS WITH A PAST — OBJECTS WITH A NEXT** = visual character, object memory, nostalgia, authored composition.

Nostalgia is **not** sepia/grain decoration. It is object memory expressed through:
- snapshot behavior,
- archive labels,
- trace notes,
- personal-object context,
- asymmetric/editorial image composition,
- subtle paper/record/archive logic,
- continuity of the same object through its lifecycle.

### Custom Teswa marks

Teswa now has authored product marks rather than relying on generic Material icons for root meaning:

- POSSIBLE
- MINE
- BETWEEN US
- ME
- PUT INTO PLAY

Utility actions such as Camera, Back, Share, Delete, Settings remain conventional/native icons.

Core rule:
> **Teswa-specific meaning gets authored marks. Generic device/tool actions stay platform-native.**

---

## 4. ROOT IA — LOCKED

Only four persistent roots:

1. **اكتشف / POSSIBLE**
2. **دولابي / MINE**
3. **بيننا / BETWEEN US**
4. **أنا / ME / EVIDENCE**

`حط حاجة` is **not** a fifth root. It is the private-object → public-possibility threshold.

Notifications are a destination/overlay, not a root.  
Nearby is a discovery lens, not a root.  
Standalone Motion / City Pulse is not a user-facing root world.

---

## 5. IMPLEMENTATION COVERAGE

The actual native application has been rebuilt across the real product surfaces.

### Session / account
- Native auth entry.
- Account gate / identity completion.
- Release package identity preserved.

### POSSIBLE
- Discovery home uses authored object moments rather than generic repeated cards.
- Search/Discover inherits the same object language.
- People remains secondary, not a competing social feed.
- Stories are secondary context after real objects, not the app’s primary social world.
- Nearby remains a lens.

### MINE / Dolab
- Private object world, not “My Listings”.
- Draft / ready / published / exchanged / archived meanings preserved.
- Wardrobe/private collection logic introduced.
- Object-memory and trace language used.
- Ready → publication is a visible threshold.
- Dolab → Direct sharing remains supported.

### Item Detail
- Object portrait instead of marketplace PDP.
- Image/object comes before metadata.
- Owner, context, condition, story and “open to” are progressively disclosed.
- Offer entry visually connects the public object to a candidate object from the user’s Dolab.
- Native public sharing restored.

### Add / Edit Item
- Add Item represents a private object leaving MINE and entering POSSIBLE.
- Media, condition and story are framed as the object’s evidence/trace.
- Final action is “حطّها في اللعب”.
- Edit Listing is aligned to the same production system.

### BETWEEN US
This must never collapse into a generic inbox.

Core visual/product law:

> **TWO THINGS + ONE RELATION**

Implemented:
- activity world,
- offers,
- accepted-offer → Deal transition,
- direct conversations,
- contextual/story replies,
- Deal coordination,
- bilateral completion,
- review evidence.

### Offers
- exactly one requested active item ↔ one offered active item;
- optional message;
- no cash / fairness score / bundle semantics;
- pending/thinking/accepted/etc remain backend contract states;
- acceptance creates/opens a Deal but does not claim the physical exchange happened.

### Deal / REAL
- pair identity persists into the Deal.
- accepted != completed.
- bilateral completion remains explicit.
- one side confirming does not silently complete the whole exchange.
- review only follows completed reality.

### Direct
- request-gated person conversation;
- not auto-open social DMs;
- direct contract remains distinct from contextual/story replies and Deal conversation;
- Dolab content can be intentionally brought into the conversation.

### Contextual
- story/entity reason must remain visible;
- the conversation preserves **why the two people are talking**.

### ME / EVIDENCE
- identity archive, not social-stat dashboard;
- profile is composed from identity + object/exchange evidence;
- public profiles inherit the same authored identity/evidence world;
- no single giant trust score.

### Stories
- snapshots/postcards rather than Instagram-circle imitation;
- preserve media, contextual replies and voice;
- remain secondary to objects and exchange.

### Other production surfaces
- Notifications
- Settings
- Reporting
- Reviews
- Voice
- Sharing
- Profile edit
- Public profile
- People
- loading / empty / error / conflict states
- RTL/accessibility-related system work
- semantic motion/haptics

---

## 6. DESIGN AUTHORITY DOCUMENTS

Read these before changing major product language.

### Phase 01 — structural product/system authority
- `docs/phase01/TESWA_PRODUCTION_EXPERIENCE_SYSTEM_V1_2026-09-17.md`
- `docs/phase01/TESWA_TARGETED_RESEARCH_OPERATING_RULE_V1_2026-09-17.md`
- `docs/phase01/TESWA_COMPONENT_SYSTEM_V1_2026-09-17.md`
- `docs/phase01/TESWA_CLOSURE_PASS_01_BRIEF_2026-09-17.md`

### Phase 02 — art-direction authority
- `docs/phase02/TESWA_VISUAL_CONSTITUTION_V2_2026-09-17.md`
- `docs/phase02/TESWA_ROOT_MARKS_AND_OBJECT_MEMORY_GRAMMAR_V1_2026-09-17.md`
- `docs/phase02/TESWA_ANCHOR_01_DISCOVER_HOME_V1_2026-09-17.md`
- `docs/phase02/TESWA_ANCHOR_02_DOLAB_V1_2026-09-17.md`
- `docs/phase02/TESWA_ANCHOR_03_BETWEEN_US_V1_2026-09-17.md`
- `docs/phase02/TESWA_ANCHOR_04_ITEM_DETAIL_V1_2026-09-17.md`
- `docs/phase02/TESWA_ANCHOR_05_ME_EVIDENCE_V1_2026-09-17.md`

Targeted research remains open. Visual branching does not.

Operating rule:

`REAL PRODUCT QUESTION → TARGETED RESEARCH → EXTRACT MECHANIC → TRANSLATE TO TESWA → IMPLEMENT ONCE → REAL-DEVICE VERIFY → LOCK`

---

## 7. GOOGLE PLAY INTERNAL TEST — NEXT ACTION

Teswa is already an existing Google Play application. This is an update to the same package, **not** a new Play listing.

Use the workflow on **main**:

`.github/workflows/android-native-play-release.yml`

Workflow name:

**Android Native Play Release**

For this candidate use:

- `source_ref = d46bb53d1a572f8162b0e0b0d62f3821f30ad5e7`
- `target = internal`
- `api_base_url = https://core01.tail6afd9b.ts.net`
- `rollout_percent = 100` (ignored for Internal, harmless default)
- production confirmation: leave empty
- closed_track: irrelevant when target=internal

The workflow:
- verifies release signing secrets,
- verifies the Google Play upload key fingerprint,
- runs native unit tests,
- compiles release Kotlin,
- runs release lint,
- builds a **signed release AAB**,
- publishes directly to Google Play Internal Testing.

### Important

Do **not** use the debug preview AAB for Play.

The old debug preview:
- is debug-signed,
- is not the Play release artifact,
- historically used the rehearsal fallback unless release configuration was injected.

The Play workflow above is the correct release-signing + production-API path.

---

## 8. REAL-DEVICE ACCEPTANCE PASS

After Internal Testing delivers versionCode 28, test the product as a **product**, not only as “does it open”.

### First visual pass
Check:
- first viewport of Discover;
- Dolab identity;
- Item Detail;
- Between Us;
- Me/Profile.

Question:
> Does this now look unmistakably authored for Teswa, or does any major screen still collapse to “heading + paragraph + chips + rows”?

If a screen still feels like skeleton/generic Material, fix the root cause rather than adding decoration.

### Functional sequence
Run at least:

1. cold launch / restored session;
2. login/account gate if available;
3. Discover scroll;
4. open item;
5. public share;
6. add/private object to Dolab;
7. prepare/publish object;
8. edit listing;
9. create offer using a Dolab item;
10. inspect incoming/sent offer;
11. accept offer → Deal;
12. Deal text + voice if practical;
13. first participant confirms completion;
14. second participant confirms completion;
15. review;
16. Direct request flow;
17. Contextual story reply;
18. Story create/view/manage;
19. Profile and Public Profile;
20. Notifications;
21. Settings/reporting.

### Device-quality checks
Specifically inspect:
- long Arabic text;
- large font scale;
- RTL directional icons;
- keyboard/IME;
- edge-to-edge;
- small-screen clipping;
- permission denied paths;
- missing images;
- slow network;
- offline/error states;
- stale/conflict state;
- voice controls;
- share target apps;
- back navigation;
- bottom navigation visibility in focused screens;
- object continuity between MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE.

---

## 9. WHAT IS STILL NOT “DONE”

Even with CI green, the following are intentionally **not** declared finished until device proof:

1. **Real-device visual acceptance of Phase 02.**
2. Real two-account offer → Deal → bilateral completion verification.
3. Story/media behavior on the real tester device.
4. Voice/permission UX on device.
5. Share-card rendering in real share targets.
6. Long-Arabic / font-scale / IME / edge-to-edge device QA.

External/domain follow-up:
- verified Android App Links still need production
  `.well-known/assetlinks.json`
  with package `com.teswa.mobile` and the correct Play signing fingerprint.

This external App Links item must **not** block visual/product Internal Testing.

---

## 10. IF INTERNAL TEST FINDS BUGS

Stay on:

`audit/native-product-reality-20260917`

Do not merge PR #526.

Fix the actual observed device issue.  
Run the native Foundation workflow.  
Then increment the Play version code before the next upload:

- current consumed candidate: **28**
- next re-upload after fixes should use **29** (then 30, etc.)

Do not reuse a Play version code.

Keep `versionName` independent from the required monotonically increasing `versionCode`.

---

## 11. DO-NOT-REGRESS RULES

- Do not merge without Omar’s explicit approval.
- Do not reintroduce Supabase mobile runtime coupling.
- Do not restore old Expo UI as the design authority.
- Do not rebuild Teswa as a generic marketplace.
- Do not flatten Direct / Contextual / Deal into one generic chat contract.
- Do not turn Dolab into “My Listings”.
- Do not add cash/fairness/bundle semantics to Offer.
- Do not treat accepted as completed.
- Do not expose backend implementation language (Oracle/Supabase/etc.) in user-facing copy.
- Do not make Motion/City Pulse a fifth root.
- Do not invent a giant trust score.
- Do not add decorative nostalgia that has no object-memory meaning.
- Do not replace Teswa’s authored root marks with generic icons.
- Do not make every section a rounded card.

---

## 12. CURRENT PR / RELEASE STATE

At the time this handoff was written:

- PR #526: **Open**
- Draft: **Yes**
- Merged: **No**
- Mergeable: **Yes**
- validated code checkpoint: `d46bb53d1a572f8162b0e0b0d62f3821f30ad5e7`
- Android Native Foundation run #210: **SUCCESS**
- candidate: **versionCode 28 / versionName 1.0.12**
- package: `com.teswa.mobile`
- release API: `https://core01.tail6afd9b.ts.net`

The next chat should **not** spend time reconstructing history before acting.

### Resume instruction for next chat

Start with:

> Read `docs/TESWA_NATIVE_PHASE02_FINAL_HANDOFF_2026-09-18.md`. Verify PR #526 and the latest branch head. If Internal Testing has not been published yet, publish the validated versionCode 28 candidate from commit `d46bb53d1a572f8162b0e0b0d62f3821f30ad5e7` using the main Android Native Play Release workflow. Then use Omar’s real-device screenshots/feedback as the only authority for the next closure pass. Keep PR #526 Draft and Unmerged until Omar explicitly approves merge.

---

## 13. END STATE OF THIS CHAT

The architecture, product truth, Phase 02 art direction, native implementation closure, release-version preparation and CI validation have been carried through in this session.

The remaining work is no longer “design the app in theory”.

It is now:

**SHIP TO INTERNAL → LOOK AT THE REAL PRODUCT → FIX WHAT THE DEVICE PROVES → LOCK → PRODUCTION LATER.**
