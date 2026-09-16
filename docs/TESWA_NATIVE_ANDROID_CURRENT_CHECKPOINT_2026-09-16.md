# Teswa Native Android — Current Checkpoint — 2026-09-16

> **Read this before the older `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md`.** The older handoff remains useful for architecture/history, but its Dolab, Edit Listing, Reporting, Followers/Following, and navigation status is stale. Always re-check PR #523 head before writing.

## Repository state

- Repository: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — `Build Teswa native Android Oracle client`
- Latest verified implementation checkpoint before this documentation commit: `46e16879461af889b7125fc31028bfcdb67a6ee8`
- PR remains **open, mergeable, not merged**.
- Do **not** merge #523 unless Omar explicitly asks.
- Continue using focused JVM/unit tests + `compileDebugKotlin`; no APK/AAB during normal feature slices.

## Closed native product slices

### Dolab Native 2.0 critical path

Implemented:

- secure object-centric image/media capture/upload/preview/delete;
- shared voice UI/player reuse without a second voice stack;
- Dolab -> Add Item prefill/handoff;
- durable source relationship via `publishedItemId`;
- post-publish reconciliation that avoids duplicate marketplace listings when only Dolab relation marking fails;
- Direct messaging bridge:
  - `من دولابي` inserts a small item/note selection into the direct composer;
  - `حفظ في دولابي` saves direct text messages;
  - direct voice is copied into Dolab-owned `dolab_media`.

Key green checkpoints:

- `c1e5ac1e019303b285e54d22f5b1f6c9020427a2` — Dolab media capture/previews.
- `518faceda05cb98098bb2455ee3a52e3aa632750` — Dolab -> Add Item publishing bridge.
- `0498c2a1981bbdd754b7f779e7be51a240403ed7` — Dolab <-> Direct messaging bridge; Android #59 + Canonical #31 green.

### Full Edit Listing Native

Native listing editing is implemented instead of delete/recreate:

- preserves the existing marketplace `itemId`;
- owner-only edit entry from Item Detail;
- core fields use the real Oracle edit contract;
- existing images remain references until the ordered image plan is accepted;
- only newly added images are uploaded;
- up to four images with remove/reorder/set-cover behavior;
- shared Add Item validation/media/upload primitives are reused;
- Item Detail reloads after editor exit;
- partial durable save is reported honestly if core data saved but a later image stage fails.

Oracle routes used:

- `GET /v1/marketplace/items/{id}/edit`
- `POST /v1/marketplace/items/{id}/edit`
- `GET /v1/marketplace/items/{id}/edit/images`
- `POST /v1/marketplace/items/{id}/edit/images/plan`
- existing `/v1/media/uploads`, upload URL PUT, `/v1/media/uploads/complete`, `/v1/media/objects` cleanup.

Verified at `c01338b824642bdde21ec1933d544d98ef430d57`:

- Canonical #33: **success**.
- Android Native Foundation #61: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

### Native Trust & Safety / Reporting

One reusable Oracle-backed native reporting experience now covers:

- user/profile;
- marketplace item;
- story;
- direct message;
- deal;
- deal message.

Implementation structure:

- typed report targets + allowed reasons;
- Oracle context validation before submission;
- one Arabic reusable Reporting Dialog hosted centrally in `AppShell`;
- feature screens only emit a real typed `ReportTarget`;
- self-owned content/messages avoid report actions where ownership is known;
- contextual/story-reply message reporting was intentionally not invented because Oracle has no contextual-message report endpoint.

Verified at `be6e22237005d32413f446f8a64ca7229b81a3f9`:

- Canonical #38: **success**.
- Android Native Foundation #66: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

### Reusable Followers / Following

The Oracle read contract already existed; no backend endpoint was invented.

Contract reused:

- `GET /v1/profiles/{profileId}/connections?mode=followers|following&limit=50`

Native behavior:

- one reusable `ProfileConnectionsScreen` handles both modes;
- Arabic-first shared loading/empty/error states;
- rows use the existing public profile identity fields;
- selecting another user opens the existing `PublicProfileScreen`, not a duplicate profile implementation;
- the current user's own row is marked and does not recursively open itself;
- Public Profile follower/following counters are now real navigation entry points.

Implementation:

- `7270f66c69fb9a5f5ff5e900e0c37eedf4837c53` — connections screen/repository integration/tests;
- `7a9d0d95bfda138fba6e79708fd12e00b9624c47` — final repository type correction.

Verified at `7a9d0d9...`:

- Canonical #41: **success**.
- Android Native Foundation #69: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

### Home / Navigation reconciliation — first pass

Bottom navigation is now reduced from six permanent destinations to five product-level destinations:

- الرئيسية
- اكتشف
- إضافة
- الرسائل
- حسابي

Notifications remain a real internal destination for push/deep links and manual access, but are no longer a permanent sixth bottom tab. Home exposes `تنبيهات` from its header, and the existing notification permission/sync/routing logic remains intact.

Implementation:

- `c5832905962ad6876fcc2b4b9e3df863cbb05ba5` — hide Notifications from permanent bottom navigation while preserving the route;
- `46e16879461af889b7125fc31028bfcdb67a6ee8` — expose Notifications from Home.

Verified at `46e1687...`:

- Canonical #43: **success**.
- Android Native Foundation #71: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

No emulator/APK/AAB was used for these feature slices.

## Active next product/release slice

Proceed with **final UI/state quality + static/release cleanup**, not new large product architecture.

Priorities:

1. route consistency and navigation polish after the five-tab shell;
2. remove misplaced/clutter actions and obvious placeholder-like UI;
3. loading/empty/error/offline consistency across core surfaces;
4. RTL and dark-mode review using the existing theme/system support;
5. static/lint/dependency/warning cleanup without changing product semantics;
6. then move to the physical-device release gate.

Dark mode is already system-aware in `TeswaTheme`. Android manifest already declares `android:supportsRtl="true"`; do not force a new global layout-direction architecture without a concrete failing case.

## Remaining release gates after quality/static cleanup

- physical-device critical-flow smoke: auth/session, camera/gallery/media, location, messaging/voice, Stories, Dolab, Edit Listing, Reporting, Followers/Following;
- push/background/deep-link acceptance on device;
- signed v26 AAB using the existing Play signing identity;
- Play Internal update-over-installed-app validation;
- production Oracle end-to-end acceptance;
- controlled cutover + rollback evidence;
- only after acceptance, a separate cleanup PR removing legacy Expo/React Native/Supabase mobile runtime.

## Non-negotiable architecture reminder

- Expo is behavioral reference only.
- Oracle contracts own data/business truth.
- Native Android owns the best UX implementation.
- No Supabase/Expo runtime dependency in `android-native`.
- No network calls in Composables.
- Reuse real repeated primitives; avoid duplicate media/voice/network stacks.
- `applicationId com.teswa.mobile`, `versionCode 26`, and the existing Play signing identity stay unchanged until the release plan explicitly changes them.
- Do not claim production acceptance from JVM/compile CI alone.
