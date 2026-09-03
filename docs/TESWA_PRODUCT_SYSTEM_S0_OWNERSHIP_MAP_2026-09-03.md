# Teswa Product System — S0 Ownership Map

Date: 2026-09-03  
Branch: `audit/product-system-20260903`  
Parent system audit: `docs/TESWA_PRODUCT_DESIGN_SYSTEM_AUDIT_2026-09-03.md`

## Purpose

Turn the Lane 5 baseline into an operational ownership map before implementation.

This file does not redesign feature screens. It defines:

- source-of-truth files
- compatibility/debt files
- adoption reality
- forbidden new drift
- migration waves
- system acceptance gates

---

# 1. Current ownership graph

## 1.1 Color/theme

### Intended authority

`constants/themes.ts`
-> `ThemePreferencesProvider`
-> `useTeswaColors / useTeswaStyles`
-> primitives/patterns/features

### Compatibility path

`constants/themes.ts`
-> `constants/colors.ts`
-> static module-load color object
-> many feature StyleSheets

### Finding

Repository code search surfaced **100 paths** importing `@/constants/colors` before the query cap was reached.

By contrast, the search surfaced **18 paths** using `useTeswaColors`.

This is not a reason for a mass rewrite. It is evidence that reactive theme semantics are not the current product default.

### Decision

- `constants/themes.ts`: **OWNER**
- `lib/theme/use-teswa-theme.ts`: **OWNER**
- `lib/preferences/appearance.tsx`: **OWNER**
- `constants/colors.ts`: **COMPATIBILITY DEBT**
- new semantic UI imports from `constants/colors.ts`: **STOP**
- existing imports: migrate only when a component/surface enters an approved adoption wave

Hard-coded art-direction values may remain in authored surfaces when they are explicitly visual, not semantic.

---

# 2. Spacing ownership

## Current

`constants/spacing.ts`:
- xs 4
- sm 8
- md 12
- lg 16
- xl 24
- xxl 32
- xxxl 40

`constants/themes.ts` repeats a subset:
- none 0
- xs 4
- sm 8
- md 12
- lg 16
- xl 24
- xxl 32

### Finding

Search surfaced at least 100 paths already importing `@/constants/spacing`.

This means the spacing scale has strong adoption, but Restyle duplicates it and feature code still contains optical/raw values.

### Decision

- `constants/spacing.ts`: **SCALE OWNER**
- Restyle spacing must derive from the scale
- optical values are allowed only inside authored/media details
- repeated raw layout values become migration candidates

Classification: **KEEP + CONSOLIDATE**

---

# 3. Radius ownership

## Current split

`constants/radii.ts`:
- sm 8
- md 12
- lg 16
- xl 24
- xxl 28
- round 999

Restyle:
- sm 8
- md 12
- lg 18
- xl 24
- pill 999

### Finding

Search surfaced 95 paths importing `@/constants/radii`.

The standalone radius file is therefore already the de facto product scale.

### Decision

- `constants/radii.ts`: **SCALE OWNER**
- Restyle radii: **DERIVED CONSUMER**
- the 18px Restyle `lg` divergence: **FIX**
- do not rename/delete public radius keys until usage is mapped during S1

Classification: **KEEP SCALE / FIX DUPLICATION**

---

# 4. Typography ownership

## Current

`constants/typography.ts`:
- size values only
- weight values only

### Finding

Search surfaced only two imports:
- `components/ui/AppText.tsx`
- `components/ui/SectionHeader.tsx`

Meanwhile direct `fontSize` usage is widespread across screens and feature components.

### Meaning

Typography is currently not a product system. It is mostly local styling with a small primitive fallback.

### Decision

`constants/typography.ts` must be **REBUILT AS SEMANTIC TYPE AUTHORITY**, preserving useful existing values where they fit.

Target semantic roles:

- display
- pageTitle
- sectionTitle
- cardTitle
- body
- bodyStrong
- label
- button
- caption
- meta
- numeric

Every role must specify Arabic-tested:
- size
- line height
- weight

The type layer must not force all authored hero text into one generic size. Authored variants can exist as named roles.

---

# 5. State ownership

## Existing primitives

- `AppLoadingState`
- `AppErrorState`
- `EmptyState`

### Adoption finding

Code search surfaced:
- `AppLoadingState`: definition only
- `AppErrorState`: definition only
- `EmptyState`: 36 surfaced paths, including real screens

### Decision

Do not assume all three primitives are healthy merely because they exist.

- `EmptyState`: **KEEP AS ACTIVE INPUT**
- `AppLoadingState`: **REVIEW / REBUILD**
- `AppErrorState`: **REVIEW / REBUILD**

The target should be a state family, not three isolated components.

Required family:

- PageLoading
- InlineLoading
- Skeleton
- EmptyFirstUse
- EmptyFiltered
- ErrorRecoverable
- ErrorBlocked
- OfflineStale
- PermissionRequired
- PermissionDenied
- Progress
- Success

The family may share internals while exposing task-specific wrappers.

---

# 6. Primitive adoption reality

## AppButton

Search surfaced 63 paths referencing `AppButton`.

Status: **ACTIVE CORE PRIMITIVE**

Keep and harden:
- 44pt minimum
- accessibility state
- loading
- variants
- press feedback

Needs S2:
- semantic type role
- contrast-safe primary treatment
- reduced-motion-compatible feedback
- optional accessible icon-only sibling primitive
- centralized haptic policy only if haptics are added

## AppCard

Search surfaced 24 paths referencing `AppCard`.

Status: **ACTIVE BUT NOT DOMINANT**

Feature code still recreates many card recipes.

Needs S2/S3:
- Surface primitive
- clear quiet/interactive/authored separation
- no attempt to force all feature hero cards into AppCard

## AppText

Status: **FOUNDATIONAL**

Needs S1/S2:
- semantic variants
- resolved-language direction
- Arabic line-height ownership
- large-text review

## AppInput

Status: **FOUNDATIONAL**

Needs:
- semantic label/helper/error ownership
- field-group pattern
- resolved-language direction
- focus state
- validation state

## Bottom sheets / action sheets

Status: **GOOD SHARED OWNERSHIP**

They already use reactive theme and adaptive direction.

Needs:
- new central direction source
- reduced-motion behavior inherited through motion primitives
- accessibility/focus review

---

# 7. RTL ownership

## Current sources

- `lib/i18n/index.ts` owns language preference/resolution
- `hooks/useRTLSetup.ts` enables RTL but does not align direction with resolved app language
- `AppText`, `AppInput`, sheets consume `I18nManager.isRTL`
- many feature components hard-code RTL layout independently

Search surfaced:
- only 5 paths using `I18nManager.isRTL`
- at least 50 surfaced paths using hard-coded `row-reverse`

### Decision

Language resolution must own direction resolution.

Target:

`LanguagePreference -> ResolvedLanguage -> ResolvedDirection -> layout primitives/components`

Not:

`device direction + feature guesses`

### S1 required infrastructure

Create one direction API that exposes:
- language
- isRTL
- textAlign start behavior
- row direction
- semantic start/end
- directional icon helpers where necessary

Avoid introducing another local helper per feature.

---

# 8. Motion ownership

## Current common primitive

`components/motion/AppFadeIn.tsx`

Problem:
- timing values are local props/defaults
- no reduced-motion path

## Ambient

`TeswaAmbientBackground` owns authored continuous background drift.

Problem:
- no reduced-motion path

## Feature motion

Press-scale, looped pulse, Reanimated/Moti/Animated timings exist in many features.

### Decision

S1 introduces:
- motion durations
- standard easing/spring presets
- reduced-motion hook/adapter
- semantic motion categories

No mass animation rewrite.

Migrate first:
1. AppFadeIn
2. ambient background
3. AppButton
4. shared sheets
5. shared loading/state patterns

Feature authored motion migrates when its feature enters review.

---

# 9. Accessibility ownership

## Good existing behaviors

- AppButton: role + busy/disabled
- many icon controls: labels
- selected tabs/filters: some accessibility state
- text scaling is not globally disabled

## System gaps

- no central target-size primitive
- no focus token/pattern
- no contrast CI/gate
- no reduced-motion native contract
- no standard label/hint policy
- fixed-size authored controls can be smaller than 44
- large text has not been proven across core flows

### Decision

Add system acceptance checks before feature adoption:

1. target size
2. accessible name
3. state exposure
4. contrast
5. large text
6. reduced motion
7. RTL reading/order
8. error identification

---

# 10. Navigation ownership

Primary tab IA remains provisional **KEEP**.

Owner:
- `app/(tabs)/_layout.tsx`

Move reusable decisions out of the route file during S1/S2:

- tab label type
- tab colors
- bar surface
- badge count style
- notification-dot style
- standard icon sizing

Do not abstract route declarations themselves unless there is a real reuse need.

---

# 11. Authored-surface exceptions

Some components are not supposed to become generic cards.

Examples:

- `HomeLivingWorldHero`
- `ProfileLivingHero`
- `SwapCeremony`
- Motion/video surfaces
- story camera/studio
- selected discovery rails

These remain **feature-owned authored components**.

But authored components must still consume:

- semantic typography
- accessibility targets
- resolved direction
- state semantics
- reduced motion
- shared action primitives where appropriate

Art direction is an exception to visual uniformity, not an exception to product-system quality.

---

# 12. New-code guardrails effective now

Until S1 lands:

## Do

- use `spacing` and `radii`
- use `useTeswaColors/useTeswaStyles` for semantic color
- use existing active primitives when they fit
- add accessibility roles/labels/states
- keep Arabic copy authored

## Do not

- add new imports from `constants/colors.ts` for semantic UI
- add a new reusable component with hard-coded semantic HEX colors
- invent new spacing/radius scales
- introduce another generic button/card/input primitive
- patch RTL with a new local direction system
- add continuous decorative animation without a reduced-motion plan
- redesign a feature screen just to make it visually match another screen

---

# 13. Migration waves

## Wave A — S1 foundation authority

Owned files:

- `constants/themes.ts`
- `constants/spacing.ts`
- `constants/radii.ts`
- `constants/typography.ts`
- new motion/direction foundation files if required
- `lib/theme/use-teswa-theme.ts`
- `lib/i18n/index.ts`
- `hooks/useRTLSetup.ts`

Goal:
one authority graph, no feature redesign.

## Wave B — S2 primitives

Owned files:

- `components/ui/*`
- `components/sheets/*`
- shared motion primitive(s)

Goal:
make primitives trustworthy enough for feature adoption.

## Wave C — root/navigation/state shell

Owned files:

- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`

Goal:
remove root-system exceptions and standardize navigation/state shell.

Only after Lane 0 release-base coordination.

## Wave D — feature adoption

Order comes from Lane 1 priorities.

Each feature adoption must be narrow and reviewable.

---

# 14. S0 exit criteria

S0 is considered closed when:

- system thesis is documented
- ownership graph is documented
- current adoption/debt is mapped
- new-code drift rules are documented
- S1 owned files are explicit
- no broad feature redesign has occurred
- branch remains isolated from release/backend/infra lanes

Current status: **S0 documentation complete enough to enter S1 design/implementation planning.**
