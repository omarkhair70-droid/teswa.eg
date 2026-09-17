# TESWA PRODUCTION EXPERIENCE SYSTEM V1

**Date:** 2026-09-17  
**Status:** PRODUCTION DESIGN AUTHORITY  
**Applies to:** `android-native/`  
**Supersedes:** the disposable P2 three-direction offer experiments and any KEEP/KILL comparison lane for product UI.

This document is the single design authority for the native Teswa rebuild. We are no longer designing multiple visual candidates for the same screen. One coherent product language is defined here and is carried across every screen, state, transition, icon, control and system response.

---

## 1. Product thesis

> **Teswa turns what people already own into possibilities between them — carrying each possibility from private possession, through evidence and proposal, into a real exchange that both people confirm.**

Internal product phrase:

> **PUT WHAT YOU HAVE INTO PLAY.**

The product spine is:

`MINE → POSSIBLE → BETWEEN US → REAL → EVIDENCE`

The UI must make this spine visible without spelling it out everywhere.

---

## 2. Reference extraction — what the strong apps actually teach us

We are not copying screenshots. We are taking structural mechanics.

### Airbnb — state-dependent product architecture

Source: Airbnb 2025 Summer Release / all-new app.

Airbnb does not treat every capability as an equal tile. Discovery is the dominant state before booking; after booking, the product reorganizes around Trips, itinerary, messages and in-context actions. The same account therefore feels different depending on what has become real.

**Teswa translation:**

- before a proposal: object discovery and possibility dominate;
- after an offer exists: shared state becomes more important than browsing;
- after acceptance: Deal becomes the operational center;
- after completion: outcome becomes evidence on the people involved.

Do not keep showing marketplace chrome when the user has already crossed into a shared commitment.

### Oura / Instrument — progressive disclosure and semantic hierarchy

Source: Instrument, “Designing a more intuitive ŌURA app.”

Oura rebuilt around progressive disclosure, a semantic color system, a clearer grid and a simplified component language. Information is not equally loud. At-a-glance information appears first, focused context second, deep detail third.

**Teswa translation:**

- GLANCE: object, person, state, location relevance;
- UNDERSTAND: condition, desire, evidence, why this interaction exists;
- COMMIT: the exact information required before offer / accept / complete;
- DEEP: history, reviews, full description, reporting and edge detail.

### Material 3 Expressive / Android

Source: Android Developers Material 3 in Compose, shared transitions and predictive back guidance.

Material 3 Expressive treats color, type, shape, containment and motion as one system. Android’s native shared-element and predictive-back behavior gives continuity between surfaces instead of arbitrary page changes.

**Teswa translation:**

- one shape system, not a random radius per feature;
- one icon family;
- motion connects the same object across screens;
- sheets for secondary decisions;
- predictive back is preserved;
- large product moments can be expressive, routine controls stay quiet.

### Apple Design Awards — platform-native interaction

Source: Apple Design Awards 2026, Interaction category.

The useful lesson is not an iOS visual style. It is that the strongest interaction work keeps controls direct, legible and native to the device instead of turning every action into custom theater.

**Teswa translation:**

- no decorative gesture that hides meaning;
- direct manipulation only when it improves understanding;
- haptics confirm meaningful thresholds, not every tap;
- motion is a consequence of state, not wallpaper.

---

## 3. The final visual language — EXCHANGE FIELD

The Teswa UI is an **object-first exchange field**, not a catalog of cards.

### 3.1 Surface model

Default screen background is warm paper. Content lives directly on that field. A container is introduced only when one of these is true:

1. the content is one durable entity (item, offer, deal, review);
2. the user must understand a boundary or state;
3. the surface is interactive and needs a hit target;
4. the content is temporary / modal.

This means **no card soup**. Headings, explanatory copy and secondary metadata should normally sit on the screen field without their own card.

### 3.2 Color roles

Light theme is the primary authored presentation.

- **Paper / background:** `#FBF8F3`
- **Surface / object sheet:** `#FFFDFC`
- **Ink:** `#211A17`
- **Clay / primary:** `#93482F`
- **Clay container:** `#FFDBCF`
- **Sage / trust-secondary:** `#46665B`
- **Sage container:** `#C9EBDD`
- **Amber / attention-tertiary:** `#805610`
- **Muted field:** `#F2E8E2`
- **Outline:** `#88736A`
- **Destructive:** Material error role

Color is semantic. Clay means authored action / exchange energy. Sage supports trust, evidence or calm positive information. Amber marks attention or unresolved significance. Destructive red is reserved for destructive/safety actions.

Dark theme uses the same role relationships rather than becoming a separate art direction.

### 3.3 Type system

Arabic-first, native Android sans stack. No ornamental display font in product UI.

Roles:

- Hero: 38/46, Bold — very rare, launch / major state only.
- Screen title: 30/38, Bold.
- Section title: 22–25, SemiBold.
- Entity title: 18–20, SemiBold.
- Body: 16/26.
- Secondary body: 14/22.
- Labels: 12–14, Medium/SemiBold.

Rules:

- Arabic text is never squeezed to preserve a decorative layout.
- Titles can wrap to two lines before truncation.
- Numbers and English model names may remain LTR inside RTL text, but container direction stays semantic.
- Important state is never encoded only by font weight.

### 3.4 Shape system

One radius ladder:

- 8dp — tiny controls / badges.
- 12dp — compact controls.
- 18dp — fields / compact surfaces.
- 24dp — entity surfaces / sheets.
- 32dp — hero object/media containers.
- full pill — state chips only.

Large media may use an authored 32dp container. Do not invent a new radius per screen.

### 3.5 Spacing

Base rhythm: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40` dp.

Screen horizontal inset: 18–20dp on phones.  
Minimum touch target: 48dp.  
Primary bottom action safe inset: 16–20dp plus navigation/IME inset.

### 3.6 Elevation

Use tonal separation first. Shadow is reserved for:

- floating composer/action;
- modal sheet;
- transient overlay;
- media lifted during a direct-manipulation transition.

Ordinary entity rows do not need drop shadows.

---

## 4. One icon family

**Production icon language: Material Symbols / Compose `Icons.Rounded` only.**

No text glyphs such as `⌂`, `⌕`, `✉`, `●`. No emoji. No mixing outlined, sharp, hand-drawn and filled styles casually.

Default icon size: 24dp. Compact metadata: 20dp. Hero / isolated action: 28dp. Touch container remains at least 48dp.

Semantic map:

| Meaning | Rounded icon family |
|---|---|
| Explore / possibility | `Explore` / `Search` |
| Mine / Dolab | `Inventory2` |
| Between us | `Forum` / `ChatBubbleOutline` |
| Me | `PersonOutline` |
| Add / put into play | `AddCircle` |
| Notifications | `NotificationsNone` |
| Filter | `Tune` |
| Location | `Place` / `NearMe` |
| Offer / exchange | `SwapHoriz` |
| Waiting / thinking | `Schedule` |
| Accepted / completed | `CheckCircle` |
| Back | `ArrowBack` (mirrors in RTL where supported) |
| More | `MoreVert` |
| Camera | `PhotoCamera` |
| Gallery | `Image` |
| Voice | `Mic` |
| Send | `Send` |
| Review | `Star` |
| Trust / safety | `VerifiedUser` / `Shield` |
| Edit | `Edit` |
| Archive | `Archive` |
| Delete | `DeleteOutline` |
| Report | `Report` |
| Block | `Block` |
| Settings | `Settings` |
| Share | `Share` |
| Refresh | `Refresh` |

Filled/selected treatment is permitted only to express selection in navigation or an explicit toggled state.

---

## 5. Motion system

Motion has four jobs only: continuity, hierarchy, response and commitment.

### 5.1 Timing

- **micro:** 120ms — press/fade/icon state.
- **standard:** 220ms — local content changes.
- **emphasized:** 320ms — sheet/container/state transition.
- **commit:** 420ms — accepted offer, publish, completion; spring-led where appropriate.

Use system/Material easing for routine motion. Use a medium-low-bounce spring only for authored commitment moments. Never bounce destructive or error states.

### 5.2 Shared continuity

Use shared element/bounds transitions where the same durable object crosses surfaces:

- discovery item → item detail;
- own possession → publish review;
- requested/offered item → Offer detail;
- accepted Offer → Deal header;
- profile avatar → public profile where navigation architecture supports it.

The object should feel like the same object moving through state, not a new card being redrawn.

### 5.3 Navigation

- Forward detail: content expands from its origin, 220–320ms.
- Back: Android predictive back remains visible and truthful.
- Secondary choice: ModalBottomSheet.
- Destructive confirmation: dialog/sheet only when consequence requires interruption.
- Root tab switch: no theatrical slide; quiet crossfade/short container response.

### 5.4 Haptics

- light selection tick: selecting an owned item for an offer, filter, one-choice control;
- medium confirmation: send offer / publish item;
- success confirmation: offer accepted / both sides confirmed exchange;
- warning haptic: destructive confirmation immediately before execution;
- no haptic for loading, scrolling, passive state changes or every navigation tap.

---

## 6. Root information architecture

Final root model:

### `اكتشف` — POSSIBLE
Public possibility. Discovery feed, search, nearby lens, stories when useful, item detail and public people context.

### `دولابي` — MINE
Private possessions and preparation. Drafts, ready items, published bridge, capture/edit/publish.

### `بيننا` — BETWEEN US
Everything that became relational: offers, deals, direct requests, contextual conversations and coordination.

### `أنا` — ME / EVIDENCE
Identity, evidence, reviews, settings, safety/account.

**There is no permanent “Add” destination.** “حط حاجة” is a universal action that enters the Dolab/capture flow while preserving where the user came from.

Notifications are an overlay/destination, not a root world.

Nearby is a lens inside discovery, not a permanent root tab.

---

## 7. Reusable production primitives

### ObjectStage
Large media-first representation of one possession. Used on item detail, own item, offer/deal header. 32dp media radius; title and owner/state live below or partly overlap only when contrast is guaranteed.

### ObjectRow
Compact object identity for lists and choices. Thumbnail + title + one line of meaningful metadata + state/action affordance.

### ExchangePair
One semantic component that always preserves:

`requested object ↔ offered object`

It is used in offer compose, offer detail and deal header. The visuals may compact as state becomes durable, but the pair identity never disappears.

### StatePill
Short status only: `مستني رد`, `بيفكر`, `اتقبل`, `مستني تأكيدك`, `اكتمل`. StatePill is not a generic tag system.

### EvidenceLine
Compact evidence with icon + fact + optional drill-in, e.g. completed swaps, response signal, review count. Only shown when relevant to the next decision.

### SectionHeader
Title + optional single action. No nested card around it.

### BottomCommitBar
Sticky lower action area for consequential actions. Contains one primary action plus at most one secondary action. Respects keyboard/navigation insets.

### ActionSheet
Bottom sheet for filters, object selection, listing status actions, safety and secondary choices.

### EmptyField
Purposeful empty state with one sentence and one action. No giant illustration requirement.

### InlineState
Loading/error/conflict stays where the affected entity lives whenever possible instead of replacing the entire screen.

---

## 8. COMPLETE SCREEN AUTHORITY

Every current native feature must land in one of the screens below. This is the screen set; we do not create parallel visual alternatives.

### A. SESSION / ACCOUNT

#### A01 — Session restore
**Purpose:** resolve session without flashing sign-in UI.  
**Anatomy:** centered Teswa wordmark, subtle progress motion, warm field.  
**Motion:** 220ms fade into destination when restored.  
**States:** restoring / expired / transport failure.

#### A02 — Sign in
**Purpose:** one clear entrance.  
**Anatomy:** Teswa mark, one-line product proposition, Google action, minimal legal/account note if required.  
**No:** feature carousel, card stack, fake onboarding slideshow.

#### A03 — Account gate
**Purpose:** communicate blocked/unready account state.  
**Anatomy:** state title, exact reason, one next action, sign-out secondary.  
**Motion:** none beyond state replacement.

---

### B. POSSIBLE / DISCOVERY

#### B01 — Discover home
**Purpose:** show possibilities, not a product grid.  
**Anatomy:** compact top identity row + search affordance; optional nearby context; a paced vertical stream of object moments; occasional authored discovery cluster; story/social strip only when it changes discovery.  
**Primary object treatment:** media-first, variable but system-bound vertical rhythm; metadata reduced to title, condition clue, area/distance and owner evidence when needed.  
**No:** endless equal cards, dashboard counters, dense filter chrome above content.

#### B02 — Search
**Purpose:** direct intent.  
**Anatomy:** native SearchBar, recent/meaningful suggestions, category shortcuts only when useful, live result transition.  
**Motion:** SearchBar expands using Material motion; predictive back collapses it.

#### B03 — Search results
**Purpose:** scan and compare without becoming catalog soup.  
**Anatomy:** query pinned compactly; horizontal filter summary; mixed object list with strong media and clean metadata.  
**State:** result count is secondary; zero result becomes a useful redirect, not dead end.

#### B04 — Filters / sort sheet
**Purpose:** constrain possibility.  
**Anatomy:** location radius, category, condition, relevance/sort; active choices visibly summarized.  
**Interaction:** ModalBottomSheet, immediate local feedback, one apply action if server fetch is expensive.

#### B05 — Nearby lens
**Purpose:** make practical exchange feasibility visible.  
**Anatomy:** location context first; distance bands/nearby objects; map only when it materially improves choice.  
**No:** location as a gamified feed by itself.

#### B06 — Item detail
**Purpose:** move from glance to enough evidence for an offer.  
**Anatomy order:** media stage → title/condition/area → owner identity → what they want / openness → description/story → evidence relevant to commitment → sticky `قدّم عرض`.  
**Motion:** shared item media/title from discovery; bottom action becomes contextual once offer exists.  
**States:** active / reserved / unavailable / own item / deleted/missing.

#### B07 — Public profile
**Purpose:** answer “who is this person enough for this interaction?”  
**Anatomy:** avatar/name/area; outcome evidence; reviews; active public possessions; direct-contact affordance when allowed.  
**No:** social vanity metrics dominating exchange evidence.

#### B08 — Story viewer / contextual object
**Purpose:** lightweight context that can lead to an object/person conversation.  
**Anatomy:** immersive media, author identity, entity anchor, reply affordance.  
**Exit:** contextual reply preserves what was being replied to.

---

### C. MINE / DOLAB

#### C01 — Dolab overview
**Purpose:** private object world.  
**Anatomy:** screen title + `حط حاجة`; state sections: drafts / ready / in play / exchanged / archived; object rows or media blocks, not marketplace cards.  
**Key distinction:** drafts and private notes feel private; published state is visibly a bridge to public possibility.

#### C02 — Dolab item detail
**Purpose:** work on one possession before/after publication.  
**Anatomy:** media, title, private notes/source, exchange intent, state history, primary next action.  
**States:** draft / ready / published / exchanged / archived.

#### C03 — Capture / media
**Purpose:** begin with the object, not a form.  
**Anatomy:** camera/gallery actions; 1–4 media tray; reorder/remove; continue only after minimum requirement.  
**Motion:** selected photo lifts into ordered tray; haptic on reorder/drop.

#### C04 — Describe item
**Purpose:** collect durable identity.  
**Fields:** title, category, condition, condition notes, description, item story, city/area.  
**Layout:** progressive groups, not every field on one giant page.

#### C05 — Exchange intent
**Purpose:** express desire without pricing.  
**Anatomy:** specific / flexible / surprise modes; desire text; swap reason / good-for context where relevant.  
**No:** monetary estimate or fairness score.

#### C06 — Publish review
**Purpose:** show exactly what is about to leave the private world.  
**Anatomy:** final ObjectStage + public fields + desire + location visibility + edit anchors + bottom commit action.  
**Motion:** object visually crosses from private muted field into clay-accent public state on publish.

#### C07 — Published transition
**Purpose:** confirm publication without fake celebration.  
**Anatomy:** item remains on screen, state changes to `في اللعب`, actions: view public item / back to Dolab.  
**Haptic:** medium success.

#### C08 — Own published item
**Purpose:** manage one object already in play.  
**Actions:** edit, archive when allowed, see open offers, reactivate if archived.  
**Conflict:** explain why archive/delete is blocked by open offer/deal history.

#### C09 — Edit listing
**Purpose:** change allowed public facts without losing relational history.  
**Anatomy:** same language as create, prefilled, save changes in BottomCommitBar.

#### C10 — Archive / reactivate / deletion consequence
**Purpose:** explain durable history.  
**Presentation:** ActionSheet or focused consequence screen depending severity.  
**Never:** generic “Are you sure?” without explaining open offers/deal-history constraint.

---

### D. BETWEEN US / SHARED STATE

#### D01 — Between Us hub
**Purpose:** replace generic “Messages” with semantic activity.  
**Groups:** `محتاجك`, `مستني`, `بينكم دلوقتي`, `رسائل`, `السجل`.  
**Rows:** entity + person + exact state + most relevant timestamp/action.  
**No:** one undifferentiated chat inbox.

#### D02 — Compose offer
**Purpose:** form one explicit relation: one of theirs ↔ one of mine.  
**Anatomy:** requested object remains visible; owned-item selector opens as sheet; selected object forms ExchangePair; optional message subordinate; consequence copy; `ابعت العرض`.  
**No:** checkout summary, bid UI, price, bundle builder, fairness meter.

#### D03 — Incoming offer detail
**Purpose:** understand the proposition before reacting.  
**Anatomy:** sender identity → ExchangePair → optional message → relevant evidence → actions `موافق`, `هفكر`, `مش مناسب`.  
**Haptic:** selection/commit only after action confirmation.

#### D04 — Outgoing offer detail
**Purpose:** make waiting legible.  
**Anatomy:** ExchangePair, recipient, `مستني رد`, sent context, allowed next action only.  
**No:** fake progress spinner.

#### D05 — Thinking state
**Purpose:** explicit “not yet.”  
**Anatomy:** same offer object, StatePill `بيفكر`, no semantic reset.  
**Motion:** state container morph, not a new screen identity.

#### D06 — Soft rejected
**Purpose:** close without hostility.  
**Anatomy:** offer pair stays as history; clear status; return to item/discovery option.

#### D07 — Accepted → Deal threshold
**Purpose:** show that accepted proposal created a new shared object.  
**Motion:** ExchangePair compresses/settles into Deal header over ~420ms; confirmation haptic.  
**Copy:** agreement is confirmed, exchange is not yet claimed complete.

#### D08 — Deal room
**Purpose:** operational center after acceptance.  
**Persistent header:** requested item + offered item + other participant + deal state.  
**Body:** next required action first, then conversation/coordination history.  
**Actions:** message/voice, coordinate, confirm when appropriate, report/safety.

#### D09 — Deal conversation
**Purpose:** coordinate while preserving why the conversation exists.  
**Anatomy:** compact Deal header never disappears; messages; media/voice; read state; composer.  
**No:** detached generic chat title with only person name.

#### D10 — Voice record / voice message
**Purpose:** low-friction coordination.  
**Interaction:** hold/tap record according to current implementation choice; elapsed time, cancel/send, playback waveform/progress if available.  
**Haptic:** start/stop only.

#### D11 — Coordination / meetup
**Purpose:** bridge digital agreement to reality.  
**Anatomy:** area/location context, agreed notes if supported, safety reminder only when relevant, direct return to Deal.  
**No:** pretend that arranging a meeting equals completion.

#### D12 — First-side completion confirmation
**Purpose:** one participant says physical exchange happened.  
**Anatomy:** exact two items and person; consequence; confirm.  
**After action:** state becomes `مستني تأكيد الطرف التاني`.

#### D13 — Waiting for second confirmation
**Purpose:** represent asymmetry truthfully.  
**Anatomy:** Deal stays open; one side confirmed; other pending; contact/report paths remain.

#### D14 — Completed deal
**Purpose:** close real exchange and create evidence.  
**Motion:** calm state settle, not confetti.  
**Actions:** review, see exchanged items/history.

#### D15 — Review
**Purpose:** convert real outcome into evidence.  
**Fields:** 1–5 rating, comment, clear description, good communication, on time, respectful swapper.  
**Anatomy:** person + deal/item context at top; traits as explicit controls; submit once.

#### D16 — Direct request
**Purpose:** person-to-person contact outside accepted Deal with a request boundary.  
**States:** requested / accepted / ignored / blocked.  
**No:** silently opening unrestricted DM.

#### D17 — Direct conversation
**Purpose:** person conversation that may feed Dolab.  
**Header:** person identity + request state.  
**Actions:** save text/voice into Dolab where supported; share eligible Dolab item.

#### D18 — Contextual conversation
**Purpose:** preserve story/entity reply context.  
**Header:** original story/entity anchor + person.  
**No:** flatten to ordinary direct thread after first message.

---

### E. ME / EVIDENCE / CONTROL

#### E01 — My profile
**Purpose:** identity and outcome evidence, not item management.  
**Anatomy:** avatar/name/area/bio; successful exchange evidence; response/review context; edit profile; settings.  
**Dolab is no longer hidden behind a floating button here.**

#### E02 — Edit profile
**Purpose:** focused identity editing.  
**Anatomy:** image, display identity fields, area/bio allowed by contract; sticky save.

#### E03 — Evidence / reviews
**Purpose:** inspect what makes this identity trustworthy.  
**Anatomy:** summary first, completed-outcome reviews second, trait evidence third where supported.

#### E04 — People / follows
**Purpose:** retain only socially useful connections.  
**Anatomy:** searchable people rows, relationship action, context if known.  
**No:** engagement vanity as the primary reason for the screen.

#### E05 — Notifications
**Purpose:** state changes that deserve return.  
**Anatomy:** grouped by today/earlier or semantic urgency; each notification says what changed and navigates directly to durable entity.  
**No:** noisy generic activity feed.

#### E06 — Settings
**Purpose:** account/product control.  
**Sections:** account, notifications, privacy/safety, app/preferences, sign out.  
**Layout:** continuous list with clear group headings; not a card per row.

#### E07 — Report
**Purpose:** safety action with context.  
**Anatomy:** target identity, reason choices matching backend (`misleading_item`, `inappropriate_content`, `spam_offer`, `unsafe_behavior`, `no_show`, `harassment`, `fraud`, `other`), optional detail if supported, submit consequence.

#### E08 — Block confirmation
**Purpose:** explain what blocking changes, then execute.  
**Presentation:** focused sheet/dialog; destructive button visually distinct.

---

## 9. SYSTEM STATES

Every production screen must explicitly implement the states below instead of improvising per feature.

### Loading
Prefer skeleton/placeholder in the final content geometry. Spinner is reserved for compact blocking work or unknown geometry.

### Empty
Explain why the space is empty and give one meaningful action.

### Offline / transport failure
Keep last durable state when safe. Inline retry. Do not erase the screen into a generic error page unless no useful state exists.

### Auth expired
Return through account/session boundary without pretending a product operation failed.

### Shared-state conflict / HTTP 409
Use entity-specific copy: “الحالة اتغيرت” + refresh/current truth. This is not a generic network error.

### Permission denied
Explain what capability is unavailable, offer system/settings path only if needed, preserve rest of screen.

### Missing/deleted entity
Show what type of object is gone and a safe destination back.

### No eligible owned item
Offer compose explains that an active own item is required and routes to Dolab/capture.

### Long Arabic / mixed text
All core layouts must survive 160-character Arabic titles, Arabic + English product model names, missing images and IME-open state.

---

## 10. Screen chrome rules

- Edge-to-edge by default.
- Top app bars are minimal; large titles live in content when they carry hierarchy.
- Search uses native Material SearchBar behavior.
- Secondary options use ModalBottomSheet.
- Root navigation stays visible only in root worlds, not in focused detail/commitment flows.
- One primary action per screen region.
- FAB is reserved for the global `حط حاجة` action where it is genuinely useful; it does not coexist with another dominant bottom CTA.
- System bars use theme-derived colors and icon contrast.
- Keyboard never covers the active input or bottom commitment action.

---

## 11. Accessibility and RTL

- Arabic/RTL is the authority, not a later mirror pass.
- Reading order and TalkBack order must match meaning, especially ExchangePair: requested → relationship → offered → state/actions.
- Icons with direction must mirror semantically; neutral object/action icons do not mirror just because layout is RTL.
- No state depends on color alone.
- Text contrast follows Material accessibility requirements.
- Touch targets 48dp minimum.
- Motion respects reduced animation/system scale; essential state remains understandable without motion.
- Every media image has meaningful semantics or is explicitly decorative.

---

## 12. Microcopy voice

Teswa speaks like a calm Egyptian product, not a bank, auction house or corporate dashboard.

Use:

- `حط حاجة`
- `قدّم عرض`
- `مستني رد`
- `بيفكر`
- `بينكم دلوقتي`
- `مستني تأكيدك`
- `الحالة اتغيرت`

Avoid:

- “transaction” language in user-facing Arabic;
- fake urgency;
- fairness claims;
- “success!” for states that are only digital agreement;
- vague “Something went wrong” when the exact product state is known.

---

## 13. Implementation order is not design iteration

The design authority above is already one system. Code can land in multiple commits because the app is large, but each commit implements this same authority; it does not reopen visual directions.

Implementation sequence:

1. Foundation: tokens, theme, icons, motion, common primitives.
2. Root shell: `اكتشف / دولابي / بيننا / أنا`, universal `حط حاجة`, notification route.
3. POSSIBLE: discovery/search/item/public profile/story context.
4. MINE: Dolab/capture/describe/intent/publish/own item/edit.
5. BETWEEN US: hub/offer/deal/conversations/completion/review.
6. ME: profile/evidence/people/notifications/settings/safety.
7. Cross-system states, predictive back, shared transitions, haptics, accessibility pass.
8. Real-device visual + interaction QA is verification of the authority, not a new design competition.

---

## 14. Definition of done for every screen

A screen is not done because it compiles. It is done when:

- its purpose and primary action are unambiguous;
- loading/empty/error/conflict/long-content states are covered where applicable;
- iconography comes only from the Teswa icon family;
- typography/spacing/shapes use system tokens;
- transitions use the motion rules above;
- meaningful haptics are wired where specified;
- RTL and TalkBack order are correct;
- keyboard/insets and smallest supported phone width are handled;
- no visual legacy from the Expo app or disposable P2 labs is required to understand the screen;
- the state maps to the real Oracle/native contract rather than invented UI behavior.

---

## 15. External references

- Airbnb 2025 Summer Release: https://news.airbnb.com/product-releases/airbnb-2025-summer-release
- Instrument — Oura App redesign: https://www.instrument.com/work/oura-app
- Android Developers — Material 3 in Compose: https://developer.android.com/develop/ui/compose/designsystems/material3
- Android Developers — Shared element transitions: https://developer.android.com/develop/ui/compose/animation/shared-elements
- Android Developers — Predictive back: https://developer.android.com/develop/ui/compose/system/predictive-back
- Apple Design Awards 2026: https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/

---

# FINAL AUTHORITY

There is one Teswa native product language from this point forward:

**Warm object-first field. Progressive evidence. One rounded icon family. Native Android motion. Private possessions become public possibilities, proposals become shared state, shared state becomes real-world confirmation, and real outcomes become evidence.**

The previous three-direction Offer experiment is historical research only and must not drive production UI.