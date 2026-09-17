# TESWA COMPONENT SYSTEM V1

**Date:** 2026-09-17  
**Status:** LOCKED FOUNDATION  
**Scope:** all native Android production UI.

The product is not allowed to style screens independently. Every production screen must be composed from one shared system covering typography, layout, navigation, iconography, controls, content primitives, states, motion, haptics, accessibility and RTL.

## 1. Type

Single authority: `TeswaTypography.kt` → `MaterialTheme.typography`.

Roles:
- displaySmall: rare authored hero state;
- headlineLarge: screen/world title;
- headlineMedium/headlineSmall: major sections and durable entity hierarchy;
- titleLarge/titleMedium/titleSmall: entity titles, rows and local section hierarchy;
- bodyLarge/bodyMedium/bodySmall: content and supporting context;
- labelLarge/labelMedium/labelSmall: controls, metadata, state labels.

Rules:
- Arabic is the authority; mixed Arabic/English model names must remain readable.
- Product screens do not introduce arbitrary `sp` values.
- No decorative product font until a researched Arabic family passes real-device readability and performance tests.
- Important state never relies on typography alone.

## 2. Layout

Single authority: `TeswaLayout.kt` + `TeswaTokens.kt`.

Base spacing: 4 / 8 / 12 / 16 / 18 / 20 / 24 / 32 / 40dp.

Phone page inset: 18dp. Minimum touch target: 48dp. Root/focused surfaces share the same geometry rules. Long titles get two lines before truncation. Insets/IME are part of layout, not cleanup work.

No screen gets a private spacing ladder.

## 3. Navigation

Single semantic authority: `TeswaNavigation.kt`.

Permanent product worlds:
- `اكتشف` — POSSIBLE;
- `دولابي` — MINE;
- `بيننا` — BETWEEN US;
- `أنا` — ME / EVIDENCE.

`حط حاجة` is an action, not a permanent information-architecture world. Nearby is a discovery lens. Notifications are a destination/overlay. Detail, compose, review, settings, safety and commitment flows use focused chrome and may hide root navigation.

Navigation implementation must preserve Android predictive back and screen state. Wider layouts may later use Material adaptive navigation without changing the four product worlds.

## 4. Icons

Single authority: `TeswaIcons.kt`.

Material Rounded only for production UI unless an authored custom symbol is explicitly researched, system-wide and necessary. No Unicode navigation glyphs, emoji or mixed Sharp/Outlined/Rounded styles.

Sizes:
- 20dp compact metadata;
- 24dp standard;
- 28dp isolated/hero control;
- minimum interaction container remains 48dp.

Selected/filled treatment indicates actual selection/state, not decoration.

## 5. Shape and surface

Radius authority: 8 / 12 / 18 / 24 / 32dp + full state pill.

Surface law: content lives on the warm field by default. Containers exist only for durable entities, boundaries, interactive hit areas or temporary/modal surfaces.

No card-per-section UI. Tonal separation before shadow. Shadows are reserved for floating/modal/transient/direct-manipulation states.

## 6. Color

Semantic roles only:
- paper/background;
- surface;
- ink;
- clay = authored exchange/action energy;
- sage = trust/evidence/calm positive context;
- amber = unresolved attention;
- error = destructive/safety.

Screen code must consume theme roles rather than introduce random brand hex values.

## 7. Action hierarchy

Each region gets one obvious primary action.

Families:
- primary commitment button;
- secondary outlined/text action;
- icon button;
- stateful toggle/chip;
- bottom commitment bar;
- FAB only for the universal `حط حاجة` action when it does not compete with another dominant CTA.

Destructive actions never visually compete with the main constructive action.

## 8. Inputs

Use Material text/input semantics with Teswa geometry and Arabic-first labels.

Required shared patterns:
- single-line search;
- multiline description/context;
- one-choice selector;
- chips for bounded categorical choice;
- media picker/reorder;
- voice composer;
- optional message;
- filter sheet.

Validation is local and specific. Do not wait for submit to reveal obvious field errors. Keyboard/IME must never cover the active field or commitment action.

## 9. Content primitives

Production primitives include:
- ObjectStage;
- ObjectRow;
- ExchangePair;
- EvidenceLine;
- StatePill;
- ScreenHeading;
- SectionHeader;
- BottomCommitBar;
- ActionSheet;
- EmptyField;
- InlineState.

A durable object should keep recognizable identity as it moves feed → detail → offer → deal.

## 10. Lists and feeds

Discovery is not an equal-card catalog grid.

Use paced media-first object moments, compact rows where scanning matters, and clear section rhythm. Metadata density is driven by the next decision, not by what fields happen to exist in the backend.

Lazy lists need stable keys. Loading-more belongs at the list boundary. Empty/filter-empty are distinct states.

## 11. Top bars and headers

Top bars stay quiet. Large authored titles can live in content. Focused detail gets back + exact title/identity + at most one contextual action before overflow.

Do not put refresh, notifications, filters, settings and more all in the same visual rank.

## 12. Bottom bars and sheets

Root bottom navigation appears only in root worlds.

Consequential actions use `BottomCommitBar`, respecting system navigation and IME insets.

Secondary selection/filter/action collections use Material bottom sheets so parent context stays legible. Destructive confirmation becomes a focused dialog/sheet only when the consequence actually warrants interruption.

## 13. State system

All shared UI implements the same categories:
- loading;
- empty;
- filtered empty;
- inline error;
- offline/transport failure;
- auth expired;
- shared-state conflict/409;
- permission denied;
- missing/deleted entity;
- disabled/ineligible action;
- success/commitment transition.

Do not invent “Something went wrong” when the product knows what changed.

## 14. Motion

Authority: `TeswaMotion.kt`.

- 120ms micro response;
- 220ms standard state/content response;
- 320ms emphasized sheet/container transition;
- ~420ms authored commitment transition.

Shared continuity is preferred when the same object crosses surfaces. Root-tab switches stay quiet. Motion explains state; it does not decorate empty space.

## 15. Haptics

Use sparingly:
- selection tick;
- send/publish confirmation;
- accept/completion success;
- destructive warning immediately around confirmed execution.

No haptic for scrolling, loading, passive updates or every tab tap.

## 16. Media

One image treatment system controls:
- hero aspect ratio;
- feed aspect ratios;
- thumbnails;
- missing-image state;
- crop/content scale;
- media count/reorder affordance;
- shared-transition identity.

Do not let individual features invent independent image proportions without a product reason.

## 17. RTL and accessibility

RTL is authored first.

- visual order, reading order and TalkBack order must express the same meaning;
- directional icons mirror semantically;
- neutral icons do not mirror simply because the locale is RTL;
- minimum target 48dp;
- state never depends on color alone;
- useful content descriptions for interactive media/icons;
- decorative media explicitly excluded from semantics;
- dynamic state changes must keep focus sensible;
- reduced motion/system animation settings remain usable.

## 18. Adaptive behavior

Phone remains the current production authority, but component boundaries must not prevent tablet/foldable adaptation.

When adaptive work starts, use official Material 3 adaptive navigation/list-detail primitives where they improve the product. The information architecture stays `POSSIBLE / MINE / BETWEEN US / ME`; only presentation chrome changes with available space.

## 19. Research rule

For any component whose correct behavior is uncertain, targeted research is mandatory. Research can refine the system; it cannot create a local visual exception casually.

`QUESTION → RESEARCH → EXTRACT → TRANSLATE → SHARED COMPONENT/RULE → VERIFY → LOCK`

## 20. Code enforcement

Production screens should progressively stop importing arbitrary dimensions, colors and icons directly. Shared rules live under:

`android-native/app/src/main/java/com/teswa/mobile/ui/system/`

Current authorities:
- `TeswaTokens.kt`
- `TeswaTypography.kt`
- `TeswaLayout.kt`
- `TeswaNavigation.kt`
- `TeswaIcons.kt`
- `TeswaMotion.kt`
- `TeswaComponents.kt`

`TeswaTheme.kt` composes those authorities into MaterialTheme.

## 21. Definition of component-system done

The system is complete only when all production screens consume it consistently, legacy Unicode glyphs/private spacing/random radii/card soup are gone, root IA reflects the four product worlds, common states share behavior, Android navigation/insets/IME are correct, and real-device QA confirms Arabic/RTL/accessibility/motion behavior.

The system is not a style guide PDF sitting beside the app. It is production code authority.