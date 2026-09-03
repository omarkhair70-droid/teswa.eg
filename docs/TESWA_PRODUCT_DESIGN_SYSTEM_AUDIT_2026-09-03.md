# Teswa Product & Design System Audit — Baseline

Date: 2026-09-03  
Branch: `audit/product-system-20260903`  
Parallel-plan head reviewed: `14e7198ec42f33bf0fca781c0c5c0502c628b786`

## Status

This document opens Lane 5 from `TESWA_COMPANY_CLOSURE_PARALLEL_PLAN_2026-09-03.md`.

Mode is intentionally **audit + system definition first**. No broad screen redesign belongs in this lane until the product-system contracts below are stable and Lane 1 Product Reality Audit has produced feature priorities.

Workflow:

`Reality -> Meaning -> Product Thesis -> System -> Review`

Shared classification:

`KEEP / FIX / REBUILD / DELETE`

---

# 1. Reality

## 1.1 Product reality

Teswa is a production Arabic-first social swap product, not a generic marketplace skin.

The current product includes:

- first-entry / onboarding / auth
- Home and Discover
- item discovery and item detail
- multi-step Add / media publishing
- offers and deal lifecycle
- direct / deal / story messaging
- stories and video-led Motion
- profile, trust, badges and social presence
- notifications and settings
- Dolab
- local / Living World signals
- offline memory, recovery and media-loading behavior
- device-level permissions, camera/audio/video, sharing, biometrics and notifications

The product system therefore has to support **dense utility, trust, communication, media and emotional exchange states**. A system designed only for marketplace cards will fail.

## 1.2 Existing identity worth preserving

The strongest current Teswa language is already visible in the product and public-web creative system:

- useful objects still have value
- exchange creates possibility rather than disposal
- the product should feel alive, local and human
- warm cream / burnt orange carries value/action
- teal carries social/local/living signals
- motion is meaningful when it communicates movement, response or exchange
- Arabic should feel authored, not translated into a Western shell

This is input to the app system, not permission to cover every surface in gradients or decorative motion.

## 1.3 Existing system inventory

### Theme/color layer

Current files:

- `constants/themes.ts`
- `constants/colors.ts`
- `lib/theme/use-teswa-theme.ts`
- `lib/preferences/appearance.tsx`

Positive reality:

- semantic theme names already exist: background, surface, card, elevated, text, textMuted, border, primary, accent, danger, success and soft variants
- Restyle provider exists
- reactive `useTeswaColors` / `useTeswaStyles` exists
- dark tokens exist even though dark mode is intentionally disabled for the current release

Problem reality:

- `constants/colors.ts` remains a static compatibility bridge
- many feature components still import that static object
- many screens and components also hard-code HEX/RGBA values
- theme semantics therefore do not have full authority
- dark-mode support cannot be considered system-ready even though a dark palette exists

### Spacing

Current scale:

- 4
- 8
- 12
- 16
- 24
- 32
- 40

This is a usable 4-based rhythm and should be preserved unless actual product evidence disproves it.

Problem:

- many screens still use literal values such as 5, 6, 7, 9, 10, 13, 14 etc. for gaps/padding, so the scale is guidance rather than authority.

### Radii

`constants/radii.ts` currently defines:

- 8 / 12 / 16 / 24 / 28 / pill

`constants/themes.ts` separately defines Restyle radii:

- 8 / 12 / **18** / 24 / pill

This is a concrete token conflict. Radius authority is currently split.

### Typography

`constants/typography.ts` currently defines only:

- sizes: 12 / 14 / 16 / 20 / 24
- weights: 400 / 500 / 600 / 700

Reality across the product:

- many screens/components use direct font sizes outside the scale
- important authored surfaces use 25, 29, 30, 34 and other one-off sizes
- line-height is mostly decided locally
- there are no semantic roles such as display / title / heading / body / label / caption
- Arabic text metrics are therefore not centrally authored

### Surfaces

There are two competing surface languages:

1. reusable semantic surfaces:
   - `AppCard`
   - `AppScreen`
   - theme background/surface/card/border
2. authored feature surfaces:
   - gradients
   - warm translucent cards
   - Living World heroes
   - profile cover systems
   - item-card gradients
   - auth gradients
   - many hard-coded RGBA border/surface recipes

The authored layer is valuable, but currently there is no rule for **where authored atmosphere is allowed** versus where a quiet system surface should win.

### Navigation

The primary bottom navigation is currently:

- Home
- Discover
- Add
- Messages
- Profile

Positive:

- five destinations map to the core product loop
- unread badges are already represented
- labels are Arabic and compact
- the Add action is structurally central without requiring a completely separate navigation framework

Needs review:

- navigation styling is still locally authored inside the tabs layout
- badge sizing and tab metrics are not system tokens
- directional icon rules are not centrally documented
- inner navigation patterns vary by feature

### RTL / language

Current language code defaults Teswa to Arabic and supports Arabic / English / system preference.

However:

- `useRTLSetup` only calls `I18nManager.allowRTL(true)`
- it intentionally does not force direction
- `AppText` and `AppInput` use `I18nManager.isRTL`
- sheets also adapt from `I18nManager.isRTL`
- many feature screens hard-code `row-reverse` and `textAlign: right`
- other rows remain plain `row`

This means Teswa currently mixes:

- app-language intent
- device layout direction
- hard-coded Arabic layout

For an Arabic-first product, that is not a stable RTL contract.

### Motion

Positive:

- Reanimated / Moti / Animated are already used
- press feedback exists in several core components
- haptics exist in meaningful interaction areas
- motion is part of the product identity rather than an afterthought

Problem:

- `AppFadeIn` always animates
- `TeswaAmbientBackground` runs continuous repeated motion
- ChatComposer recording pulse loops continuously while active
- native app-level motion primitives do not currently consume a reduced-motion preference
- reduced-motion handling exists in the public-web prototype, not as a product-wide native contract
- durations/easing/spring behavior are not centralized into motion tokens

### Loading / empty / error / feedback

Reusable primitives exist:

- `AppLoadingState`
- `AppErrorState`
- `EmptyState`
- `AppToastRoot`

But the product also contains many screen-specific implementations:

- custom skeletons
- manual loading copy
- custom error cards
- empty-state cards
- startup/account-gate holding screens
- ActivityIndicator-only states
- feature-local success/failure banners

The root account gate is an important example: it uses raw React Native `Text` / `Pressable`, hard-coded colors and a separate visual language outside the core primitives.

This is a fragmented state system, not yet one owned feedback system.

### Accessibility

Positive:

- many interactive surfaces already use `accessibilityRole`
- several controls provide Arabic `accessibilityLabel`
- selected tabs/buttons expose `accessibilityState`
- `AppButton` has a 44pt minimum height and busy/disabled state
- React Native text scaling is not explicitly disabled

Gaps / risks:

- icon-button hit targets are inconsistent; some authored hero actions are visibly 36x36 without a shared minimum-hit-target primitive
- focus treatment is not centralized
- accessibility hints are rare and feature-local
- dynamic type robustness is unproven because many fixed heights and local font sizes exist
- no native product-wide reduced-motion contract
- no product-level contrast gate
- some pressables rely on visual context without a shared accessible-control wrapper

### Component ownership

The repository already contains a meaningful primitive layer:

- AppText
- AppButton
- AppCard
- AppInput
- AppScreen
- AppBadge
- SectionHeader
- AppInfoRow
- AppBottomSheet / AppActionSheet
- Empty / Loading / Error states

But feature components frequently recreate:

- buttons
- pills
- cards
- section headings
- icon buttons
- state cards
- badges
- surface recipes
- typography roles

The issue is therefore not “Teswa has no design system.”

The issue is:

**Teswa has a partial system that does not yet own the product.**

---

# 2. Meaning

Teswa should not feel like:

- a generic classifieds app
- a fintech dashboard
- a social-media clone
- a decorative gradient showcase
- a collection of independently polished screens

Teswa should feel like:

**a living exchange product where useful things move between people through discovery, offers, conversation and trust.**

The design system has three jobs:

1. make action and state extremely clear
2. make exchange feel human and alive
3. keep trust/utility surfaces calmer than discovery/identity surfaces

The visual system should make the product coherent **without flattening its different modes**.

---

# 3. Product thesis

## Core thesis

**Teswa turns existing value into visible possibility between people.**

The UI should therefore make these transitions legible:

`owned -> noticed -> offered -> discussed -> exchanged -> remembered`

## Interaction thesis

Every important surface should answer at least one of these questions immediately:

- What is this?
- What can I do now?
- What changed?
- What needs my response?
- What is safe / confirmed / pending / failed?
- Where am I in the exchange?

## Emotional thesis

Teswa may be warm and alive, but never vague.

Priority order:

1. clarity
2. trust
3. response/state visibility
4. human warmth
5. authored delight

---

# 4. System

This section defines the target ownership model. It is not a mandate to rewrite every file immediately.

## 4.1 Token authority

### Decision

One token graph must own all reusable product decisions.

Target dependency:

`semantic product tokens -> primitives -> patterns -> feature surfaces`

Not:

`screen -> random hex / random radius / random font size`

### Rule

- `constants/themes.ts` owns semantic color roles
- spacing/radii/type/motion scales must have one source each
- Restyle values must be derived from the same source, not copied separately
- `constants/colors.ts` remains compatibility-only until migrated, then should be removed or made impossible to use for new UI
- new feature code must use reactive theme values where the value is semantic

### Classification

- semantic theme foundation: **KEEP**
- static compatibility color bridge: **FIX -> DELETE after migration**
- duplicate Restyle spacing/radius literals: **FIX**
- hard-coded semantic colors in reusable/feature UI: **FIX**
- hard-coded art-direction colors: **KEEP only when explicitly authored and documented**

## 4.2 Color semantics

Current palette character is worth preserving.

Required semantic roles:

- canvas/background
- surface
- elevated surface
- interactive surface
- primary text
- secondary/muted text
- separator/border
- primary action/value movement
- social/local accent
- success
- danger
- warning/attention
- selection
- disabled
- focus
- scrim/media overlay

Hard-coded color is allowed only for:

- media art direction
- deliberately authored illustration/gradient stops
- content-derived colors

It is not allowed as a substitute for semantic UI roles.

### Contrast finding

Using current light tokens:

- `text` on `background`: about 15.7:1
- `textMuted` on `background`: about 4.8:1
- white on `primary #B8623F`: about **4.32:1**
- `primary` on `primarySoft`: about **3.15:1**
- `accent` on `accentSoft`: about **3.82:1**

Therefore:

- core text/muted text foundation is strong
- primary-action text needs a specific accessibility decision because 4.32:1 misses the common 4.5:1 AA threshold for normal text
- soft-tone combinations must not automatically be treated as body-text-safe

Color validation becomes a release gate, not visual intuition.

## 4.3 Typography

Typography must move from raw sizes to semantic roles.

Required roles:

- display
- page title
- section title
- card title
- body
- body strong
- label
- caption/meta
- button label
- numeric/status

Each role must own:

- font size
- line height
- weight
- letter behavior
- Arabic alignment behavior where relevant

Rules:

- Arabic readability beats decorative thinness
- no feature should invent a new heading size because “it looked better”
- local overrides require a documented authored reason
- large-text accessibility must be tested on important flows

Classification:

- current weight set: **KEEP**
- raw type size scale: **FIX**
- screen-level arbitrary type hierarchy: **FIX progressively**
- feature-specific display typography: **KEEP only as a named authored variant**

## 4.4 Spacing

Existing 4-based rhythm is strong enough to become authority.

Rule:

- primitives and patterns use spacing tokens
- one-off pixel values remain allowed only for optical/media details
- product layout gaps should not be invented ad hoc

Classification:

- current spacing scale: **KEEP**
- repeated raw layout spacing: **FIX**

## 4.5 Radii

Do not choose between 16 and 18 repeatedly at call sites.

Rule:

- one radius source
- Restyle derives from it
- semantic aliases should describe purpose where useful: control / card / hero / pill

Immediate finding:

- 16 vs 18 duplicated `lg` values: **FIX before broad system implementation**

## 4.6 Surface hierarchy

Define four levels:

1. **Canvas** — page background
2. **Quiet surface** — forms, settings, utility, dense reading
3. **Interactive surface** — cards, controls, actionable rows
4. **Authored surface** — Living World / discovery / identity / milestone moments

Rules:

- authored gradients are not the default card style
- settings/privacy/reporting/trust should bias quiet and legible
- Home/Discover/Profile hero areas may carry stronger atmosphere
- media itself should carry visual energy when possible; UI chrome should not compete with it

## 4.7 Navigation language

Primary tab IA is provisionally **KEEP**:

- Home
- Discover
- Add
- Messages
- Profile

System work:

- move tab metrics into navigation tokens/pattern ownership
- standardize unread count vs dot semantics
- define inner-header pattern
- define back/close/menu directional icon behavior
- define when a feature uses tab navigation, stack push, modal, bottom sheet or action sheet

No navigation redesign should happen solely for visual novelty.

## 4.8 RTL authorship

### Decision

Layout direction must follow the **resolved Teswa language**, not accidentally follow the device while feature code separately assumes Arabic.

Required contract:

- Arabic => RTL
- English => LTR
- system => resolved locale direction
- changing direction may require controlled app restart if React Native layout requires it

Implementation direction:

- centralize language-direction resolution
- use semantic start/end helpers
- eliminate unnecessary raw `row-reverse`
- eliminate unnecessary hard-coded `textAlign: right`
- document directional icons
- test Arabic and English on devices whose OS language differs from the app language

Classification:

- Arabic-first product posture: **KEEP**
- current mixed direction ownership: **REBUILD at infrastructure/system layer**
- per-screen RTL patching: **DELETE progressively**

## 4.9 Motion

Motion categories:

1. **Press feedback** — immediate, short
2. **State transition** — loading -> content, sent -> confirmed, offer -> deal
3. **Spatial transition** — sheet/modal/navigation continuity
4. **Living signal** — restrained ambient/local activity
5. **Media motion** — content itself

Rules:

- motion explains action/state first
- no continuous decorative motion on every screen
- one central motion token set owns duration/easing/springs
- native reduced-motion preference must be respected
- reduced motion keeps state clarity while removing non-essential transform/continuous drift

Classification:

- current meaningful press/milestone motion: **KEEP**
- `AppFadeIn` as primitive: **FIX**
- ambient continuous animation without reduced-motion path: **FIX**
- feature-local timing values: **FIX progressively**
- decorative motion with no state/value meaning: **DELETE when encountered**

## 4.10 Feedback contract

Every interactive action must have explicit feedback ownership.

States:

- idle
- pressed
- disabled
- pending
- success
- destructive confirmation
- failure
- optimistic state
- optimistic rollback

Haptic rules should be semantic:

- selection
- confirmation
- warning/error
- destructive confirmation

Haptics are enhancement, never the only feedback.

## 4.11 Loading / empty / error / offline / permission

Required shared state families:

- initial page loading
- inline loading
- skeleton loading
- empty first-use
- empty filtered/search result
- recoverable error
- blocked/fatal state
- offline stale-data state
- permission required
- permission denied
- upload/publish progress
- success/confirmation

Each family should define:

- visual hierarchy
- copy hierarchy
- icon/illustration policy
- primary/secondary action behavior
- animation policy
- retry ownership

Current `AppLoadingState`, `AppErrorState`, and `EmptyState` should not be deleted blindly; they should become inputs to this stronger state system.

## 4.12 Accessibility contract

Minimum product gate:

- interactive target: 44x44 minimum unless a larger hitSlop guarantees the target
- meaningful icon-only controls require accessible labels
- disabled/busy/selected states exposed when relevant
- normal text contrast target >= 4.5:1
- large text/UI graphics validated to appropriate contrast rules
- focus treatment defined for web/keyboard paths
- no important meaning encoded by color alone
- text scaling must not destroy primary flows
- reduced motion supported
- media has fallback/loading/error handling
- reading/order behavior tested in RTL

Accessibility is part of component acceptance, not a final cleanup lane.

## 4.13 Component ownership

### Layer A — primitives

Owned by `components/ui` and system infrastructure.

Examples:

- Text
- Button
- IconButton
- Input
- Card/Surface
- Badge
- Divider
- Screen
- Stack/Row layout helpers
- Loading/Error/Empty
- Toast
- Sheet

Feature code should not recreate these visually unless it is an explicit authored pattern.

### Layer B — product patterns

Examples:

- page header
- section header
- filter chips
- stat rows
- person/listing rows
- action footer
- form field group
- media frame
- state panel
- navigation badge
- trust/status pill

Patterns can carry Teswa language while remaining reusable.

### Layer C — authored feature components

Examples:

- Home Living World hero
- Profile Living Hero
- swap/deal ceremony
- story studio
- Motion viewer
- authored discovery rails

These may break quiet-surface rules deliberately, but must still consume system typography, accessibility, motion and semantic-state contracts.

---

# 5. Review

## 5.1 KEEP

- five-tab core IA, pending Lane 1 evidence
- current warm cream / burnt-orange / teal identity family
- semantic theme foundation
- 4-based spacing rhythm
- existing primitive layer as the migration base
- AppButton 44pt baseline
- bottom-sheet/action-sheet shared ownership
- meaningful press feedback and haptics
- Living World concept as authored product identity
- strong Arabic product copy and warm exchange language

## 5.2 FIX

- token authority split between constants, Restyle and raw literals
- radii conflict
- type hierarchy
- semantic color contrast
- static color imports
- raw HEX/RGBA used for semantic UI
- tab metrics/badges ownership
- reduced motion
- state-system fragmentation
- accessible target sizing
- dynamic type robustness
- focus behavior
- root account-gate visual/state ownership

## 5.3 REBUILD

- RTL/language-direction infrastructure contract
- semantic typography roles
- shared product-state taxonomy
- component ownership rules for duplicated feature controls/pills/cards
- motion token/reduced-motion layer

## 5.4 DELETE progressively

Do not mass-delete yet.

Candidates to remove only after replacements exist:

- duplicate spacing/radius token definitions
- static semantic color usage
- per-screen direction patches
- duplicate button/card/state implementations
- decorative motion with no product meaning
- hard-coded semantic colors superseded by tokens

---

# 6. Severity-ranked system findings

## P1 — Must close before broad visual implementation

1. **RTL authority is inconsistent.** App language, device direction and screen-level hard-coded RTL can disagree.
2. **Theme/token authority is split.** Semantic themes exist, but static colors and hard-coded semantic values bypass them.
3. **Primary color contrast needs correction or constrained usage.** White on the current primary is ~4.32:1.
4. **Reduced motion is not a native product-wide contract.**
5. **Radius/type scales do not have one authoritative graph.**

## P2 — Must close during system implementation

1. loading/empty/error patterns are fragmented
2. root/account-gate state is visually outside the system
3. duplicated pills/cards/icon buttons exist across features
4. accessible hit targets are inconsistent
5. feature-level raw spacing/type values are widespread
6. navigation badges/metrics are locally authored
7. focus and large-text behavior are not system-tested

## P3 — Progressive cleanup

1. authored gradients need explicit ownership boundaries
2. feature-local animation timings should converge
3. semantic warning/attention/focus/scrim colors need formal tokens
4. repeated metadata/stat/list patterns should migrate to shared product patterns

---

# 7. Implementation order for Lane 5

Do not jump to random screens.

## S0 — Baseline / authority

- approve this system thesis
- inventory token consumers
- choose the single token graph
- define language-direction contract
- define accessibility gates

## S1 — Foundations

- unify spacing/radii/theme/type/motion sources
- add semantic typography roles
- add missing semantic color roles
- introduce reduced-motion utility
- introduce RTL semantic layout helpers

## S2 — Core primitives

Review and close:

- AppText
- AppButton
- IconButton
- AppInput
- AppCard / Surface
- AppScreen
- Badge
- Header
- Loading / Empty / Error / Offline / Permission states
- Toast
- BottomSheet / ActionSheet

## S3 — Product patterns

Extract only repeated real patterns discovered in product code.

No speculative component library.

## S4 — Feature adoption

Coordinate with Lane 1 priorities.

Likely order should follow product risk/value, not visual attractiveness.

## S5 — Cross-product review

For every adoption lane:

- Arabic RTL
- English LTR
- small Android
- large Android
- text scaling
- reduced motion
- offline
- loading
- empty
- error
- destructive/pending/success states
- visual consistency
- interaction feedback

---

# 8. Lane boundaries

Lane 5 owns:

- system definitions
- tokens
- primitives
- reusable product patterns
- cross-screen consistency rules
- visual/interaction accessibility contracts

Lane 5 does **not** independently decide:

- whether Home feature architecture is correct
- whether Add steps should be removed
- whether Discover functionality should change
- whether offer/deal business rules should change
- backend boundaries
- OCI migration
- release-engineering base

Those decisions require Lane 1 or the relevant parallel lane.

---

# 9. First-pass conclusion

Teswa does not need a ground-up visual reinvention.

It needs **system authority**.

The current product already contains:

- a recognizable identity
- strong authored product moments
- meaningful primitives
- a viable navigation model
- good accessibility intent in many interactions

The gap is that these decisions are not yet enforced consistently.

Therefore the next Lane 5 work should be **foundation consolidation**, not screen decoration.
