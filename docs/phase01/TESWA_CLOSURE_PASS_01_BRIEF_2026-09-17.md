# TESWA CLOSURE PASS 01 — IMPLEMENTATION BRIEF

**Date:** 2026-09-17  
**Branch:** `audit/native-product-reality-20260917`  
**PR:** #526  
**Status:** IMPLEMENTATION BRIEF — DO NOT REOPEN VISUAL DIRECTIONS

## Goal

Close the remaining product/UI gaps after the native production system and core exchange loop were implemented.

This pass is not a redesign. It is a closure pass over the parts that are still visibly outside the Teswa production system, plus the interaction layer that exists as rules but is not yet broadly wired into production screens.

The product spine remains:

`MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE`

The design authority remains:

`docs/phase01/TESWA_PRODUCTION_EXPERIENCE_SYSTEM_V1_2026-09-17.md`

The component authority remains under:

`android-native/app/src/main/java/com/teswa/mobile/ui/system/`

---

# 1. Audit conclusion

## Already strong / do not reopen

The following areas have already moved substantially into the production system and should only receive targeted consistency fixes if required:

- auth / account gate;
- root semantic navigation;
- Dolab / MINE;
- Add Item / Edit Listing;
- Item Detail;
- Offer composition and Offer states;
- Offer → Deal threshold;
- Deal room and bilateral completion;
- Direct / contextual conversation distinction;
- profile / public profile / evidence;
- reviews / reporting / safety;
- notifications;
- shared component/token/icon foundation.

Do not redesign these from zero during this pass.

## Remaining major gaps

### A. Stories are still a legacy visual/product island

Current `feature/stories` surfaces still use direct Material controls and screen-local styling heavily (`Button`, `OutlinedButton`, `OutlinedTextField`, `Card`, hardcoded dp, textual glyphs such as `+`, `♥`, `♡`, `▶`).

The current story data contract supports:

- author;
- image/video;
- caption;
- expiration;
- like state;
- reply into contextual conversation;
- owner management;
- viewers.

It does **not** currently provide a durable item/entity link in `StoryRecord`. Do not invent an item association or change the Oracle contract just to satisfy a visual idea.

Stories therefore remain a **secondary person/context discovery layer**, not a new root world and not the center of Teswa.

### B. Motion / City Pulse is still a competing discovery mini-product

`feature/motion` currently exposes a standalone “نبض تِسوى” experience with dashboard-like metrics, cards, moving items, stories, video drops, people and city pulse.

Phase 00 explicitly marked Motion / City Pulse as a **CHALLENGE** that must re-earn its place. Its current standalone presentation duplicates POSSIBLE/Discover and weakens the product hierarchy.

Decision for this pass:

> **Remove Motion / City Pulse as a standalone user-facing world. Preserve the backend/repository capability, but do not maintain a separate “نبض” mini-app inside Teswa.**

Useful location/movement signals may be folded into POSSIBLE/Nearby only when they improve a real discovery decision. Do not delete backend contracts or repositories merely because the standalone surface is demoted.

### C. POSSIBLE is structurally correct but needs final consolidation

The current split is acceptable:

- `HomeScreen` = ambient possibility stream;
- `DiscoverScreen` = explicit search/filter intent.

They are two modes of the **same POSSIBLE world**, not two separate products.

Current issues:

- Discover still exposes Stories/Motion as generic secondary destinations;
- Motion duplicates Nearby/discovery semantics;
- Stories currently appear before the object stream and can visually outrank the core object journey;
- search/filter behavior should feel like entering a focused intent mode, not another root app.

Decision:

- keep Home as ambient object-first discovery;
- keep Discover as explicit search/filter mode;
- keep Nearby as a lens inside POSSIBLE, never a root;
- keep People secondary to object/person context;
- remove the standalone Motion entry;
- keep Stories secondary and compact; they must never outrank actual exchangeable objects.

### D. Motion and haptics exist as authorities, not yet as product behavior

`TeswaMotion.kt` defines the timing vocabulary.

`TeswaHaptics.kt` defines semantic haptic events.

Current PR audit shows the haptic helper is defined but not meaningfully consumed across production screens, and there is no broad shared-element continuity implementation yet.

This pass must wire the interaction language into a small number of high-value moments. Do not animate everything.

---

# 2. Stories closure

## 2.1 Stories rail

Rebuild `StoriesRail` using Teswa production primitives/tokens/icons.

Rules:

- secondary to the object feed;
- no raw text glyphs for Add or state;
- no dashboard feel;
- loading/error/empty use Teswa feedback primitives;
- author bubbles may remain circular because identity/avatar semantics justify it;
- create/manage actions should use the shared icon/action language;
- keep the rail compact enough that the first real object possibility remains visually dominant.

If necessary, move the rail lower in the Home composition or reduce its vertical dominance. Do not make Stories the hero of POSSIBLE.

## 2.2 Story viewer

Preserve the immersive dark media surface, but rebuild controls around the production system.

Required hierarchy:

1. progress / current slide;
2. author identity;
3. media;
4. caption if present;
5. contextual reply affordance;
6. like/report as secondary actions.

Rules:

- replace `♥/♡` and textual controls with Material Rounded semantic icons added through `TeswaIcons` if needed;
- use a focused/immersive close/back control from the shared icon family;
- contextual reply must continue to open the contextual conversation contract;
- voice reply stays available;
- do not turn the viewer into generic social-media chrome;
- do not invent item links that the data model does not contain;
- preserve existing image/video support and repository behavior;
- ensure TalkBack labels and 48dp touch targets.

Do not build an elaborate custom playback engine unless required to fix an existing broken behavior. This pass is hierarchy/system closure, not a media-platform rewrite.

## 2.3 Story create

Rebuild `StoryCreateScreen` with:

- `TeswaFocusedHeader`;
- shared media/action controls;
- `TeswaTextField` for caption;
- shared inline feedback/progress treatment;
- shared primary commit action;
- Material Rounded camera/gallery/media icons;
- Teswa spacing/radii rather than local values where system tokens exist.

Preserve all existing media validation, camera/file picking, upload progress, cleanup behavior and auth/session handling.

Publish is a meaningful commitment and should use the semantic Commit haptic only after the action is actually initiated/accepted by UI logic; success haptic only after successful publish.

## 2.4 Story management

Rebuild `StoryManageScreen` and viewers list with production primitives.

- remove generic Card soup;
- replace video `▶` glyph with iconography;
- use object/media row language rather than arbitrary cards;
- deletion consequence can remain a focused confirmation, but destructive action must be semantically clear;
- viewer count / likes are secondary metadata, not the main product identity;
- successful destructive action may use semantic Reject/destructive feedback as appropriate, not celebratory motion.

---

# 3. Demote standalone Motion / City Pulse

## Required product change

Remove the user-facing path that opens `MotionScreen` as a standalone sub-world from Discover.

Specifically:

- remove the `النبض` secondary destination from `DiscoverContent`;
- remove `motionOpen` standalone-screen navigation from `DiscoverScreen`;
- do not expose Motion as a root, overlay, tab or dedicated dashboard;
- keep `MotionRepository`, models, location resolver and backend capability intact unless a small cleanup is clearly safe;
- do not perform backend schema or Oracle changes.

## Optional reuse

Only if it can be done cleanly without creating a new architecture layer, one or two useful signals may be surfaced inside POSSIBLE/Nearby, for example:

- an item already has open interest;
- a location has current activity;
- a nearby object has a relevant movement signal.

Do not surface vanity counters or a dashboard of “motion metrics.” If integrating the signals requires broad repository rewrites, leave the capability dormant rather than over-engineering it in this pass.

---

# 4. POSSIBLE consolidation

## Home = ambient possibility

Keep `HomeScreen` as the low-friction object stream.

- Objects remain primary.
- Nearby remains a compact lens.
- Search enters focused Discover mode.
- Notifications remain overlay/destination.
- Stories are secondary context, not the first thing that defines the screen.
- no new dashboard summaries.

## Discover = explicit intent

Keep `DiscoverScreen` for search/filter intent.

- search first;
- category/condition/location constraints second;
- people only when they materially help the discovery decision;
- results remain object-first;
- remove the generic “Stories + Motion context tools” block;
- no separate Motion world;
- Nearby remains part of filters/lens.

If there is duplicated state/chrome between Home and Discover, simplify it locally. Do not rewrite the entire shell or introduce a new navigation framework solely for this pass.

---

# 5. Real interaction pass

## 5.1 Motion

Use `TeswaMotion` for meaningful continuity only.

High-value targets, in priority order:

1. POSSIBLE object → Item Detail continuity;
2. Offer state change → Accepted / Deal threshold;
3. publish transition from private/ready object to public/in-play state;
4. bilateral Deal completion state change;
5. focused sheets/state changes where motion improves comprehension.

Use Compose shared element/bounds APIs only where the same durable visual object exists on both sides and the current state-based architecture can support it without a navigation rewrite.

Do **not** migrate the whole app to Navigation Compose just to obtain animation.

Do **not** add animation to loading/error/destructive states for decoration.

Root-tab switching stays quiet.

Respect system animation scale/reduced animation behavior.

## 5.2 Predictive back

Preserve Android predictive-back compatibility.

- do not intercept root back unnecessarily;
- focused states that already need explicit back handling may keep supported AndroidX Compose back APIs;
- if a high-value focused transition can adopt `PredictiveBackHandler` without architecture churn, do so;
- do not introduce a new navigation graph solely for this requirement.

## 5.3 Haptics

Actually consume `TeswaHaptics` in semantic moments.

Minimum targets:

- selecting an owned item for an Offer → `Selection`;
- sending an Offer → `Commit` when the send action is initiated after validation;
- publishing an item/story → `Commit`, then `Success` only on confirmed success;
- accepting an Offer → `Success` on confirmed server success;
- bilateral completion confirmation → `Success` when the relevant confirmation succeeds;
- rejecting/cancelling/blocking/deleting where consequence is explicit → `Reject`/appropriate semantic event.

Do not haptic every button, every tab, every scroll or every loading state.

---

# 6. Repo-wide legacy UI sweep

After the targeted areas above, scan production Android UI for remaining screen-level legacy patterns.

Look for:

- direct `Button` / `OutlinedButton` where Teswa action primitives should be used;
- direct `OutlinedTextField` where `TeswaTextField` / search primitives apply;
- generic `Card` use that creates card soup;
- raw unicode/emoji icons (`+`, `♥`, `♡`, `▶`, arrows, circles, etc.);
- screen-local hardcoded spacing/radii when Teswa tokens already exist;
- inconsistent headers/back actions;
- loading/error/empty states outside Teswa feedback language;
- directional icons that do not mirror correctly in RTL;
- touch targets below 48dp;
- controls missing content descriptions;
- root chrome visible during focused/immersive flows;
- keyboard/IME covering important commit actions.

Do not mechanically replace every Material component. Low-level implementation details may legitimately use Material primitives. The goal is consistent product language, not abstraction for its own sake.

---

# 7. Non-negotiable constraints

DO NOT:

- merge PR #526;
- merge PR #523;
- start Metro or Expo;
- use EAS;
- add Maestro;
- add screenshot/render automation;
- create new CI workflows;
- add Paparazzi/Roborazzi/benchmark infrastructure;
- perform broad dependency upgrades;
- rewrite Oracle contracts;
- reintroduce Supabase runtime coupling;
- create new visual directions;
- bring back the old three-direction Offer experiment;
- add a new standalone social/motion root;
- invent backend fields for Stories;
- spend the session writing speculative design docs instead of implementing.

Do not delete working backend capability simply because its current UI is demoted.

---

# 8. Working method

This is a long autonomous implementation session.

Use:

`inspect current code → preserve contract → implement production system → compile/check → continue`

Do not stop after writing a plan.

Prefer direct Compose implementation over architecture gymnastics.

Only create a new shared primitive after at least two real production surfaces need it or when an existing system primitive clearly lacks one semantic role.

Use targeted official Android research if a Compose/API detail is uncertain. Research is open; visual branching is closed.

---

# 9. Validation

At sensible checkpoints, run the existing native checks:

- native unit tests;
- debug Kotlin compile;
- release Kotlin compile;
- release lint;
- `git diff --check`.

Do not repeatedly run expensive checks after every tiny edit.

Fix any errors introduced by the pass before stopping.

Keep the worktree clean and push coherent commits to:

`audit/native-product-reality-20260917`

PR #526 remains draft and unmerged.

---

# 10. Completion criteria

Closure Pass 01 is complete only when:

- Stories no longer look or behave like a separate legacy UI system;
- Stories remain secondary to object exchange and preserve contextual replies;
- Motion/City Pulse is no longer exposed as a standalone user-facing mini-product;
- Home + Discover read as two modes of one POSSIBLE world;
- Nearby remains a lens rather than a destination;
- production motion is wired into a small number of meaningful state/continuity moments;
- semantic haptics are actually used in meaningful commitments;
- remaining legacy glyphs/card soup/direct controls are substantially reduced;
- RTL/accessibility/touch-target/back behavior remain sound;
- existing Oracle/domain behavior remains intact;
- native tests, debug compile, release compile and release lint pass.

At the end report only:

1. actual changes implemented;
2. commits pushed;
3. checks and results;
4. any genuine blocker backed by code/contract evidence.
