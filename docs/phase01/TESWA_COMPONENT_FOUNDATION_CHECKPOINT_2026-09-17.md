# TESWA COMPONENT FOUNDATION CHECKPOINT — 2026-09-17

Status: ACTIVE / production foundation, not a visual prototype.

## Locked component authorities now present in code

- `TeswaTypography.kt` — Arabic-first type scale consumed by the theme.
- `TeswaTokens.kt` — spacing, radius, component sizes, media ratios and semantic palette.
- `TeswaLayout.kt` — page geometry, section rhythm, focused/root padding and title limits.
- `TeswaNavigation.kt` — four semantic product worlds and chrome policy.
- `TeswaIcons.kt` — one Material Rounded semantic icon map.
- `TeswaMotion.kt` — micro / standard / emphasized / commitment motion timing.
- `TeswaHaptics.kt` — semantic selection/commit/success/reject feedback.
- `TeswaComponents.kt` — headings, state pills, primary/secondary/icon actions, bottom commit bar and empty field.
- `TeswaInputs.kt` — Arabic-first text/search/choice primitives.
- `TeswaEntities.kt` — durable object row/stage, exchange pair and evidence line.
- `TeswaIdentity.kt` — person identity primitive.
- `TeswaChrome.kt` — root navigation, universal put-into-play action and focused header.
- `TeswaSheets.kt` — shared action sheet.
- `TeswaFeedback.kt` — inline loading/message/conflict states.
- `TeswaSystemContractTest.kt` — locks the four root product realities and prevents Add/Notifications from silently becoming permanent roots.

## Research-backed platform locks

Targeted Android research on this pass confirmed:

1. Material/Compose interactive controls should preserve at least a 48dp touch target.
2. Material 3 `SearchBar` and `ModalBottomSheet` support predictive-back behavior; focused product flows should not replace them with custom back theater without a specific reason.
3. `NavigationBar` and other Material containers already participate in system-inset behavior; `Scaffold` inner padding still has to be consumed by screen content correctly.
4. Modern Compose haptic types expose semantic effects such as `Confirm`, `Reject`, `SegmentTick`, `ToggleOn` and `ToggleOff`; Teswa maps product meaning to those semantic effects rather than calling arbitrary vibration patterns.
5. Material 3 Adaptive can later move the same semantic destinations across navigation presentations for wider windows without changing Teswa's four root worlds.

Primary references:
- https://developer.android.com/develop/ui/compose/accessibility/api-defaults
- https://developer.android.com/develop/ui/compose/system/predictive-back-setup
- https://developer.android.com/develop/ui/compose/system/material-insets
- https://developer.android.com/reference/kotlin/androidx/compose/ui/hapticfeedback/HapticFeedbackType
- https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive

## Immediate migration rule

From this checkpoint forward, production screen rewrites should consume these shared primitives first. Legacy screen-local Card/Button/TextField/glyph styling is migration evidence, not design authority.

The next implementation pass is not another design exercise. It migrates real screens into the locked component language in this order:

1. root chrome + navigation semantics;
2. discovery / object feed + item detail;
3. Dolab capture and private object states;
4. Between Us / Offer / Deal durable shared states;
5. Profile / evidence / settings / safety;
6. global accessibility, long-Arabic, keyboard/insets and adaptive verification.
