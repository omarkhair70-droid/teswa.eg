# Teswa Public Web — Creative System / Continuation
Date: 2026-09-03
Branch: `web/public-front-door-creative-system-20260903`
Base: `main@2d2cbdb3c63a7d5021359416344007f7be272f9a`

## Status
Research/creative-system lane only. Do not merge an implementation before the prototype and visual QA gates are closed.

## Workflow
R0 Reality Audit → R1 Brief → R2 Research → R3 Reference Decomposition → R4 Identity Thesis → R5 Architecture / IA → R6 Visual + Interaction Grammar → R7 Prototype → R8 Browser / Visual QA → R9 Production Integration → R10 Closure.

Core rule: repeat the workflow, not another project's visual answer.

---

## R0 — Reality Audit

### Product truth
Teswa is not a brochure product. It is an Arabic-first social swap marketplace with:
- item discovery and rich item detail
- offers and deal lifecycle
- direct/deal/story messaging
- stories and motion/video discovery
- personal Living World / local discovery signals
- trust/profile/badge surfaces
- native media, location, notifications, sharing, biometric/security foundations
- Supabase-backed production data and auth

### Current web truth
- Vercel production is now buildable as an Expo Router SPA.
- `app/index.tsx` currently returns `null`.
- Root navigation sends signed-out users into Adventure / Onboarding / Login.
- There is no public product front door at `/`.
- Public legal/account-deletion routes already exist and must remain reachable.
- Authenticated and deep-linked application routes must not be broken by the public layer.
- The public web must live alongside the real app, not replace it.

### Existing brand material worth preserving
Product copy already contains a stronger Teswa voice than a generic marketplace landing page:
- "حاجتك لسه لها قيمة."
- "قبل ما تسيبها، شوف تِسوى إيه."
- "بدّل ببساطة، واختار اللي يستاهل."
- "بدّل. اكسب. اكتشف."
- "كل حاجة ليها فرصة تانية."
- "ادخل مدينة تسوي وشوف الفرص اللي مستنياك."

The Adventure surface also establishes:
- a moving city / local world
- floating objects
- exchange / opportunity language
- warm amber/orange energy against deep navy/teal
- motion as a core part of the product identity

These are inputs, not a mandate to copy the Adventure screen onto desktop.

---

## R1 — Brief

### Job of the public front door
In one visit, a new person should understand:
1. what Teswa is,
2. why swapping is more interesting than abandoning or simply listing an object,
3. that Teswa is a living social/local product rather than a classifieds form,
4. what the product actually feels like,
5. how to enter the real app or install it.

### Primary audience
Arabic-first mobile users in Egypt who have useful things they no longer need and are open to discovering another useful thing through people nearby / the Teswa community.

### Primary conversion
- Open / enter Teswa
- Google Play install when appropriate

### Secondary conversion
- Sign in
- Explore selected public/product evidence without requiring a login where technically and product-safely supported

### Non-goals
- Not a corporate company site.
- Not a feature-grid SaaS page.
- Not a fake public marketplace with invented listings.
- Not an English-first template translated to Arabic.
- Not a clone of Depop, OfferUp, Vinted, Olio, or any previous Omar/HilTech/Bahja/Habba design system.

---

## R2 — Targeted Research

### Depop
Current homepage principle:
- leads with one sharp product/culture proposition
- immediately exposes real marketplace energy, categories and live-looking content
- circularity supports the proposition rather than dominating it
Reference: https://www.depop.com/

What Teswa may borrow:
- product evidence near the top
- editorial energy
- the feeling that the marketplace is alive

What Teswa must not copy:
- fashion-first visual identity
- category taxonomy
- Western resale language

### OfferUp
Current principle:
- local value is made tangible immediately
- discovery, people nearby, listing, chat and trust are framed as one loop
Reference: https://offerup.com/
About/product framing: https://about.offerup.com/

What Teswa may borrow:
- "value close to home" clarity
- product-first local opportunity
- showing real UI/evidence instead of abstract claims

What Teswa must not copy:
- pure buy/sell framing
- green marketplace identity
- conventional classifieds grid as the site thesis

### Olio
Current principle:
- reuse/sharing is turned into a human, local behavior
- simple declarative copy makes waste/reuse emotionally legible
Reference: https://olioapp.com/en/

What Teswa may borrow:
- human reuse story
- local community framing
- clear action-led copy

What Teswa must not copy:
- free-food / charity emphasis
- mission-first page hierarchy

### Freecycle
Current principle:
- community and reuse credibility
- concrete local activity proves the network is real
Reference: https://www.freecycle.org/

What Teswa may borrow:
- proof that reuse is happening among real people
- local/community evidence

What Teswa must not copy:
- utility-directory visual language
- nonprofit tone

### Karrot
Current product principle:
- local + easy listing + private chat + trust form one understandable system
Reference: Google Play listing / current product description.

What Teswa may borrow:
- explain the loop as a connected experience, not isolated features

What Teswa must not copy:
- selling-first proposition
- feature checklist treatment

---

## R3 — Reference Decomposition

The useful synthesis is not "make Teswa look like a resale marketplace."

It is:

**Depop: living product energy**
×
**OfferUp/Karrot: local opportunity + people + chat**
×
**Olio/Freecycle: objects deserve another life**
×
**Teswa-native Adventure/Living World: movement, chance, discovery, exchange**

The public web should therefore feel like entering a moving exchange world, not scrolling a feature brochure.

---

## R4 — Identity Thesis

### Working thesis
**Teswa turns the useful things around you into new possibilities between people.**

Arabic expression should stay close to the product's existing voice:
**حاجتك لسه لها قيمة. قبل ما تسيبها، شوف تِسوى إيه.**

### Creative concept
**The Moving Value / قيمة بتتحرك**

Objects do not sit as static product cards. They move through a world:
owned → noticed → offered → matched → discussed → exchanged → remembered.

The page can visualize that movement with authored transitions and real product captures.

### Emotional character
- warm, optimistic, active
- local and human
- a little playful, not childish
- premium enough to build trust
- Arabic-native, not ornamental-Arabic

---

## R5 — Proposed Public IA

1. **Hero / Front Door**
   - Teswa proposition
   - primary CTA to enter/start
   - Google Play CTA
   - immediate authored visual evidence, not a generic phone mockup

2. **The value shift**
   - "حاجتك لسه لها قيمة"
   - object/value transformation sequence

3. **A living exchange world**
   - selected real app surfaces: discovery, stories/motion, people/local signals
   - transition should carry an object or signal from one state to the next

4. **How a swap moves**
   - publish → discover → offer → chat → complete
   - one continuous visual narrative, not five unrelated feature cards

5. **People / trust / local**
   - profiles, trust, chat, nearby/local context
   - no unsupported safety claims

6. **Product proof**
   - real screenshots/captures only
   - evidence selected from reviewed current production surfaces

7. **Final entry**
   - open Teswa / sign in / Google Play
   - legal/support footer

Potential public subpages are deferred. First close the front door.

---

## R6 — Visual + Interaction Grammar (working)

### Composition
- RTL-native desktop and mobile composition.
- Avoid centered-section repetition.
- Mix editorial full-bleed moments with tight product evidence.
- Keep copy short; let motion and real product UI explain the system.

### Color
Build from Teswa's current family rather than importing another website palette:
- warm cream / paper base
- burnt orange / amber action
- teal as social/local signal
- deep navy for cinematic/high-contrast moments

Exact web tokens must be derived after prototype contrast testing.

### Motion
Motion must communicate value movement:
- object carry
- offer handoff
- location/pulse drift
- chat/deal state progression
- subtle continuity between sections

Avoid:
- random parallax
- continuous decorative floating everywhere
- motion that competes with reading
- desktop-only spectacle

Respect reduced motion.

### Product imagery
Priority:
1. current reviewed Teswa production captures
2. authored crops/compositions from real product UI
3. brand assets
4. abstract illustration only where it explains a concept that screenshots cannot

No invented marketplace proof.

### Type / Arabic
- Arabic hierarchy first
- readable large display Arabic, not thin decorative type
- short headlines, generous line-height
- body width controlled on desktop
- mobile typography must be reviewed physically/by screenshot, not inferred from CSS

---

## R7 Gate — before production implementation
Build a dedicated prototype/exploration for the public front door.

The prototype must prove:
- hero thesis
- at least two authored carry-content transitions
- desktop + mobile composition
- actual Teswa product evidence treatment
- CTA and app-entry hierarchy
- reduced-motion fallback

Do not wire the final root route until the prototype passes visual review.

## R8 Visual QA Gate
For every meaningful iteration:
1. render desktop
2. render mobile
3. capture important motion states
4. inspect by eye
5. record exact visual deltas
6. fix exact deltas
7. re-render

Passing TypeScript/build is not visual closure.

## R9 Integration constraints
When public front door is integrated:
- authenticated users can still enter the app without friction
- signed-out root should show the public front door rather than auto-forcing Adventure/Login
- explicit login/signup routes remain available
- public legal/account-deletion routes remain available
- app/deep-link routes remain compatible with Vercel SPA fallback
- no native-only module may execute in a way that breaks web load
- Vercel production must stay auto-deployed from main

## R10 Closure
Close only after:
- typecheck
- Expo Doctor dependency state is understood/closed separately
- production web export
- Vercel preview
- desktop + mobile visual review
- root/deep-link/auth smoke
- keyboard/focus/menu/form checks
- reduced-motion
- overflow/broken-image review
- no meaningful console/runtime blocker
- final production deploy + live smoke

## Current decision
Proceed next to R7 prototype exploration. No final landing implementation has been committed yet.
