# Teswa Mobile — Home Ownership Pass v1

## Status
- Version: v1
- Scope: Product + UX architecture for the **Home** screen
- Type: Documentation-only specification
- Ownership intent: Align implementation PRs before production OTA work

---

## 1) Home Purpose

Home is the **living entry point** of Teswa. It must:

1. **Show the world is alive**
   - Immediate sense of active users, fresh content, and movement in nearby listings/activity.
2. **Guide the user to the next best action**
   - Present one clear personal step to reduce hesitation and decision fatigue.
3. **Surface personal status**
   - Make user-specific progress and account-relevant state visible without deep navigation.
4. **Expose social pulse**
   - Lightweight presence of people, stories, and moments to reinforce community energy.
5. **Lead into discovery and marketplace flow**
   - Create natural transitions from “what’s happening” to “what can I act on/buy/sell/explore.”

Home is **not** a full archive, deep management panel, or long-form browsing destination.

---

## 2) Home Sections Decision

### 2.1 Living World Hero

**Purpose**
- Deliver the first emotional and functional impression that Teswa is active right now.
- Anchor brand-level action and contextual orientation.

**Primary user action**
- Tap Hero CTA (brand-level action that opens primary exploration path).
- Open Teswa Hub Drawer from hero affordance.

**Empty / loading / error behavior**
- **Loading:** lightweight skeleton (headline + CTA placeholder), no large blank block.
- **Empty:** default branded fallback copy and single action to continue flow.
- **Error:** compact retry state with calm tone and fallback CTA to continue using Home.

**What should not be placed here**
- Dense personal metrics grids.
- Long feed lists.
- Destructive actions or sensitive account operations.

---

### 2.2 Teswa Hub Drawer

**Purpose**
- Fast utility hub for top actions and navigation shortcuts.

**Primary user action**
- Open drawer from Home hero, pick one utility path.

**Empty / loading / error behavior**
- **Loading:** near-instant; if delayed, show compact spinner only.
- **Empty:** not applicable (static actionable menu).
- **Error:** fallback close + toast/message; never trap user in blocked overlay.

**What should not be placed here**
- Hidden destructive operations.
- Deep nested navigation trees.
- Heavy content modules (video/feed rendering).

---

### 2.3 Personal “يهمك الآن” / Next Action Card

**Purpose**
- Provide the single most relevant personal next step.

**Primary user action**
- Tap contextual CTA tied to personal state.

**Empty / loading / error behavior**
- **Loading:** one compact card skeleton.
- **Empty:** actionable suggestion (e.g., complete profile, add first item, explore nearby).
- **Error:** friendly fallback with retry + safe alternate action.

**What should not be placed here**
- Brand-only campaign messaging unrelated to user state.
- Multiple competing CTAs in the same card.

---

### 2.4 Metrics Cards

**Purpose**
- Offer quick-glance personal/account signals.

**Primary user action**
- Tap a metric for detail drill-down only when valuable.

**Empty / loading / error behavior**
- **Loading:** subtle numeric placeholders.
- **Empty:** concise “no data yet” plus next step.
- **Error:** maintain layout rhythm with unobtrusive fallback text.

**What should not be placed here**
- Verbose explanations.
- Primary conversion funnels.
- Giant cards that overpower hero.

---

### 2.5 Stories Rail / Empty State

**Purpose**
- Show short-form social presence and human activity.

**Primary user action**
- Open a story or add a story.

**Empty / loading / error behavior**
- **Loading:** small circular placeholders.
- **Empty:** compact “be first to share” state with add-story CTA.
- **Error:** inline retry without expanding card height.

**What should not be placed here**
- Long text posts.
- Item catalog cards.
- Fullscreen video browsing UI.

---

### 2.6 Video Discovery / Moments Area

**Purpose**
- Preview visual discovery: items, neighborhoods, nearby movement.

**Primary user action**
- Open a moment/reel preview; continue into Discover or dedicated browse flow.

**Empty / loading / error behavior**
- **Loading:** lightweight thumbnail shimmer.
- **Empty:** “discover nearby activity” CTA into Discover.
- **Error:** compact retry and fallback browse link.

**What should not be placed here**
- Infinite full reels session on Home.
- Deep creator tools.

---

### 2.7 Marketplace Feed

**Purpose**
- Present actionable item opportunities and conversion entry points.

**Primary user action**
- Open feed card, save, message, or move toward conversion intent.

**Empty / loading / error behavior**
- **Loading:** card skeleton rhythm matching expected feed density.
- **Empty:** explain no matching items + clear discover/filter action.
- **Error:** recoverable inline retry; preserve scroll context.

**What should not be placed here**
- Stories UI patterns.
- Account settings.
- Dense hub navigation menus.

---

### 2.8 Notifications Entry

**Purpose**
- Signal timely updates and route to full notifications experience.

**Primary user action**
- Tap bell/entry to open notifications screen.

**Empty / loading / error behavior**
- **Loading:** icon-level pending indicator only.
- **Empty:** no-badge calm state.
- **Error:** graceful fallback without blocking Home use.

**What should not be placed here**
- Full notifications list rendered inline on Home.
- Alert overload that competes with hero CTA.

---

## 3) CTA Hierarchy (Conflict Prevention)

To reduce CTA conflict across Home:

1. **Hero CTA = brand-level action**
   - Highest prominence.
   - Expresses global Teswa direction/entry.

2. **Dashboard CTA = contextual personal action**
   - Second priority.
   - Must reflect user-specific state (“what matters now”).

3. **Stories CTA = lightweight social action**
   - Lower weight.
   - Focused on presence, not conversion pressure.

4. **Feed cards = item conversion action**
   - Transactional/actionable at card level.
   - Multiple per screen, each with controlled visual weight.

Rule: one dominant CTA per block; avoid parallel equal-weight CTAs in the same viewport.

---

## 4) Stories vs Reels/Moments Decision

### Initial direction
- **Stories** = short social presence from users.
- **Moments/Reels** = visual discovery for items and nearby activity.

### Home placement principle
- Home can **preview both** as lightweight entry points.
- Full exploration belongs in **Discover** or a future dedicated surface.

### Non-goal for Home v1
- Do not turn Home into a full-screen reels/stories consumption destination.

---

## 5) Teswa Hub Drawer Architecture

### Required drawer items
- الرسائل
- الإشعارات
- أضف عنصر
- أضف قصة
- استكشف
- ملفي

### Behavior contract
1. Opens from Home hero.
2. Closes on backdrop tap or system back.
3. Dismisses before navigation transition.
4. Contains no hidden destructive actions.
5. Remains fast, lightweight, and immediately scannable.

### Structural notes
- Keep grouping shallow and predictable.
- Prioritize frequent actions first.
- Keep Arabic labels concise and human.

---

## 6) UI/UX Quality Bar

Home UI updates must meet this baseline:

1. **Readable contrast**
   - Minimum contrast must preserve comfortable readability in common lighting.
2. **Touch target comfort**
   - Interactive controls should feel large and forgiving.
3. **Visual hierarchy discipline**
   - Secondary cards must stay calmer than Hero.
4. **Compact actionable empty states**
   - Empty states should be short, clear, and action-oriented.
5. **No giant empty cards**
   - Avoid dead vertical space that harms perceived quality.
6. **Arabic-first copy quality**
   - Copy should be short, human, and culturally natural.
7. **Purposeful motion**
   - Motion must be subtle, meaningful, and never distracting.

---

## 7) Future Implementation Backlog (PR Order)

A. **Home IA adjustment implementation**  
B. **Stories compact rail upgrade**  
C. **Moments/Reels preview block decision**  
D. **Hub drawer grouping and polish**  
E. **Feed card rhythm and item conversion polish**  
F. **Home offline/loading/error states pass**

Execution expectation: ship in sequence unless a blocking dependency requires reordering.

---

## 8) Safety Rules for Future Home PRs

Future Home PRs must **not** touch:
- auth/startup
- Supabase client
- migrations/backend
- direct/deal/message logic
- package/config unless explicitly required
- production OTA without Preview review first

Scope discipline is mandatory for safe iteration velocity.

---

## Testing Note for This PR

This is a **docs-only** pass.
- No runtime testing required.
- Validation command required: `git status`
- Expected diff scope: only `docs/screens/HOME_OWNERSHIP_PASS_V1.md`
