# Teswa Native Android — Current Checkpoint — 2026-09-16

> **Read this before the older `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md`.** The older handoff remains useful for architecture/history, but its Dolab and Edit Listing status is stale. Always re-check PR #523 head before writing.

## Repository state

- Repository: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — `Build Teswa native Android Oracle client`
- Latest verified implementation checkpoint before this documentation commit: `c01338b824642bdde21ec1933d544d98ef430d57`
- PR remains **open, mergeable, not merged**.
- Do **not** merge #523 unless Omar explicitly asks.
- Continue using focused JVM/unit tests + `compileDebugKotlin`; no APK/AAB during feature slices.

## Newly closed since the older handoff

### Dolab Native 2.0

The older handoff says the following are pending; they are now implemented:

- secure object-centric image/media capture/upload/preview/delete;
- shared voice UI/player reuse without a second voice stack;
- Dolab -> Add Item prefill/handoff;
- durable source relationship via `publishedItemId`;
- post-publish reconciliation that avoids duplicate marketplace listings when only Dolab relation marking fails;
- Direct messaging bridge:
  - `من دولابي` inserts a small item/note selection into the direct composer;
  - `حفظ في دولابي` saves direct text messages;
  - direct voice is copied into Dolab-owned `dolab_media`, not left as a fragile reference to direct-message storage.

Key green checkpoints:

- `c1e5ac1e019303b285e54d22f5b1f6c9020427a2` — Dolab media capture/previews.
- `518faceda05cb98098bb2455ee3a52e3aa632750` — Dolab -> Add Item publishing bridge.
- `0498c2a1981bbdd754b7f779e7be51a240403ed7` — Dolab <-> Direct messaging bridge.

`0498c2a...` passed Android Native Foundation #59 and Canonical Stabilization Validation #31.

### Full Edit Listing Native

Native listing editing is now implemented instead of being a remaining product gap.

Behavior:

- editing preserves the existing marketplace `itemId`; it does not delete/recreate the listing;
- only the listing owner receives the edit action from Item Detail;
- core fields use the real Oracle edit contract;
- existing images remain references until the ordered image plan is accepted;
- only newly added images are uploaded;
- up to four images, with remove/reorder/set-cover behavior;
- shared Add Item enums, validation, media resolver and streaming uploader are reused;
- on editor exit, Item Detail reloads instead of showing stale local detail;
- if core fields save but a later image stage fails, the UI reports that partial durable state rather than pretending an all-or-nothing rollback happened.

Oracle routes used:

- `GET /v1/marketplace/items/{id}/edit`
- `POST /v1/marketplace/items/{id}/edit`
- `GET /v1/marketplace/items/{id}/edit/images`
- `POST /v1/marketplace/items/{id}/edit/images/plan`
- existing `/v1/media/uploads`, upload URL PUT, `/v1/media/uploads/complete`, `/v1/media/objects` cleanup.

Implementation commits:

- `5a5a1eb45e9c52199e7e4cb777ffbc918bc1ef03` — initial native Edit Listing slice.
- `c01338b824642bdde21ec1933d544d98ef430d57` — compile fix isolating edit-only media/cleanup helper types.

Verified at `c01338b...`:

- Canonical Stabilization Validation #33: **success**.
- Android Native Foundation #61: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

No emulator/APK/AAB was used for this slice.

## Active next product slice

Proceed to **native Trust & Safety / Reporting**. Do not invent a backend: Oracle moderation contracts already exist and should be treated as source of truth.

Existing Oracle moderation capability includes report submission for:

- user/profile;
- marketplace item;
- direct message;
- deal;
- story;
- deal message.

Existing contract/context endpoints also support ownership/participant validation before sensitive report flows. The consumer Android app should implement the user-facing report surfaces only; admin moderation remains better suited to the existing web/admin tooling unless a product requirement explicitly changes that.

Build reporting as a small reusable native reporting experience rather than six unrelated forms. Reuse it from Item Detail, Public Profile, Stories, Direct, Deal thread/message where the existing native surface exposes the required target identifiers.

## Product work still after Reporting

Important remaining native/product/release work includes:

- reusable Followers / Following lists if still absent;
- final Home/navigation/presentation reconciliation;
- final UI/state quality pass (RTL, dark mode, loading/empty/error/offline consistency, route consistency, media performance, placeholder removal);
- push/deep-link physical-device acceptance;
- physical-device critical-flow smoke;
- release/static/lint hardening;
- signed v26 AAB with existing Play signing identity;
- Play Internal update-over-installed-app validation;
- production Oracle acceptance/cutover + rollback evidence;
- only then a separate Expo/Supabase mobile cleanup PR.

## Non-negotiable architecture reminder

- Expo is behavioral reference only.
- Oracle contracts own data/business truth.
- Native Android owns the best UX implementation.
- No Supabase/Expo runtime dependency in `android-native`.
- No network calls in Composables.
- Reuse real repeated primitives; avoid duplicate media/voice/network stacks.
- Do not claim production acceptance from JVM/compile CI alone.
