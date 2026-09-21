# TESWA TARGETED RESEARCH OPERATING RULE V1

**Date:** 2026-09-17  
**Status:** LOCKED OPERATING RULE  
**Applies to:** every production screen, interaction, state, icon, motion decision and implementation pass in `android-native/`.

Teswa has one production design authority. That does **not** mean research stops after the master system is written.

The standing rule is:

> **Research is always open. Visual branching is closed.**

When a screen, component, motion pattern, platform behavior, accessibility question, Arabic/RTL issue, state model or product interaction needs stronger evidence, stop implementation long enough to research that exact question, extract the useful mechanic, then return to the same Teswa system and implement one answer.

## The loop

`REAL PRODUCT QUESTION → TARGETED RESEARCH → EXTRACT MECHANIC → TRANSLATE TO TESWA → IMPLEMENT ONCE → REAL-DEVICE VERIFY → LOCK`

Not:

`SCREEN → 3 DIRECTIONS → VOTE → REDESIGN → REPEAT`

## What may be researched at any time

- award-winning or category-leading apps for a specific interaction;
- official Android / Material / Compose guidance;
- accessibility, TalkBack, RTL and Arabic layout behavior;
- motion, predictive back, shared transitions and haptic guidance;
- information architecture for a specific product state;
- search, filtering, messaging, trust, offers, deals, reviews and completion mechanics;
- visual hierarchy, typography, icon semantics and media presentation;
- Egyptian/local exchange behavior when it materially changes product design;
- implementation libraries or native APIs when they improve the authored experience.

## Source hierarchy

Prefer evidence in this order when the question allows it:

1. official platform documentation and first-party product releases;
2. authored case studies from the team/studio that designed the product;
3. strong production apps with inspectable behavior;
4. reputable design-system or accessibility references;
5. community discussion only for lived-use friction or edge cases, never as design authority by itself.

## What research is for

Research answers a precise question such as:

- How should a durable object visually continue from feed to detail on Android?
- What is the cleanest native pattern for one secondary selection without losing the parent context?
- How do high-quality apps expose waiting vs actionable states in a shared workflow?
- What should TalkBack announce for a requested-item ↔ offered-item relationship?
- How should a keyboard-open bottom commit action behave on a small phone?
- What evidence should be visible before a stranger accepts an exchange?

Research is **not** permission to copy a screen or import another brand's identity.

## Translation rule

Every useful reference must be translated through Teswa's own product spine:

`MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE`

A mechanic is accepted only if it strengthens one of those realities without turning Teswa into checkout, auction, generic marketplace, social feed, generic chat, or a clone of the source product.

## No embarrassment rule

Do not avoid a research pass because the question feels too small, too specific or already partly understood.

If the exact answer can materially improve production quality, research it.

Examples:

- the correct icon for a subtle state;
- whether a bottom sheet or inline expansion is better for one exact selection;
- how a strong app handles a 160-character Arabic title;
- what animation curve Android uses for a container transform;
- how another product keeps context visible while entering a conversation;
- what happens to focus order after a dynamic state change;
- how image aspect ratios are treated in a high-quality mobile feed.

Small decisions accumulate into product quality.

## Lock rule

Once targeted research produces a translated Teswa answer and it passes real-device verification, that answer becomes part of the production authority.

It is not reopened casually on the next screen.

Reopening requires one of:

- real-device evidence that the rule fails;
- accessibility failure;
- product-contract conflict;
- platform limitation/change;
- a stronger researched solution that improves the whole system rather than one isolated screen.

## Implementation discipline

Before finishing any meaningful screen:

- inspect the real Oracle/native contract;
- identify any design question that still relies on assumption;
- research those questions specifically;
- implement the translated answer using Teswa tokens/components/icons/motion;
- verify loading, empty, error, conflict and long-content states where relevant;
- verify RTL, TalkBack order, keyboard/insets and smallest supported phone width;
- capture/render on a real Android environment when visual behavior matters;
- lock the proven behavior back into the shared system.

## Final operating principle

> **We do not stop researching because the design system exists. We research so the design system keeps becoming more correct without becoming inconsistent.**

The product gets one answer. The research can be as deep and specific as necessary to make that answer excellent.
