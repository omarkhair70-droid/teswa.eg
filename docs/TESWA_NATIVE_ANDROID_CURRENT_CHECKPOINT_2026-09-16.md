# Teswa Native Android — Current Checkpoint — 2026-09-16

> **Read this before the older `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md`.** The older handoff remains useful for architecture/history, but its Dolab, Edit Listing, and Reporting status is stale. Always re-check PR #523 head before writing.

## Repository state

- Repository: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — `Build Teswa native Android Oracle client`
- Latest verified implementation checkpoint before this documentation commit: `be6e22237005d32413f446f8a64ca7229b81a3f9`
- PR remains **open, mergeable, not merged**.
- Do **not** merge #523 unless Omar explicitly asks.
- Continue using focused JVM/unit tests + `compileDebugKotlin`; no APK/AAB during feature slices.

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
  - direct voice is copied into Dolab-owned `dolab_media`, not left as a fragile reference to direct-message storage.

Key green checkpoints:

- `c1e5ac1e019303b285e54d22f5b1f6c9020427a2` — Dolab media capture/previews.
- `518faceda05cb98098bb2455ee3a52e3aa632750` — Dolab -> Add Item publishing bridge.
- `0498c2a1981bbdd754b7f779e7be51a240403ed7` — Dolab <-> Direct messaging bridge.

`0498c2a...` passed Android Native Foundation #59 and Canonical Stabilization Validation #31.

### Full Edit Listing Native

Native listing editing is implemented instead of delete/recreate.

Behavior:

- preserves the existing marketplace `itemId`;
- owner-only edit entry from Item Detail;
- core fields use the real Oracle edit contract;
- existing images remain references until the ordered image plan is accepted;
- only newly added images are uploaded;
- up to four images, with remove/reorder/set-cover behavior;
- shared Add Item enums, validation, media resolver and streaming uploader are reused;
- Item Detail reloads after editor exit;
- partial durable save is reported honestly if core data saved but a later image stage fails.

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

### Native Trust & Safety / Reporting

Consumer reporting is now a real reusable native capability, not six unrelated forms.

Implemented Oracle-backed targets:

- user/profile;
- marketplace item;
- story;
- direct message;
- deal;
- deal message.

Implementation structure:

- `feature/safety/ReportingModels.kt` — typed report targets + allowed reasons;
- `feature/safety/ReportingRepository.kt` — Oracle context validation + submission;
- `feature/safety/ReportingDialog.kt` — one Arabic reusable report experience;
- one central dialog host in `AppShell` so feature screens only emit a typed `ReportTarget`;
- real target identifiers are used rather than guessed context;
- self-owned content/messages do not expose report actions where the native surface can determine ownership;
- Contextual/story-reply message reporting was intentionally **not invented** because the current Oracle moderation contract does not expose a contextual-message report endpoint.

Reasons remain aligned with the existing contract:

- `misleading_item`
- `inappropriate_content`
- `spam_offer`
- `unsafe_behavior`
- `no_show`
- `harassment`
- `fraud`
- `other`

Key commits:

- `2731df4bc179adc32d2986eceed76d284ac4a27b` — native reporting foundation;
- `a9db8b4156fda4d25a0aa696d2a4f2b3039d7ac8` — JUnit convention fix; foundation green;
- `c16b6708f1749aa8de182eb0db5ec281973de99e` — Item/Profile/Story + central host wiring;
- `be6e22237005d32413f446f8a64ca7229b81a3f9` — Direct/Deal/Deal-message wiring.

Verified at `be6e222...`:

- Canonical Stabilization Validation #38: **success**.
- Android Native Foundation #66: **success**.
- Native unit tests: **success**.
- `compileDebugKotlin`: **success**.

No emulator/APK/AAB was used for these slices.

## Active next product slice

Proceed to a **reusable Followers / Following surface**, but inspect the real Oracle capability before coding.

Current native Public Profile already has:

- follow/unfollow mutation;
- follow state (`followingByMe`, `followsMe`, `mutual`);
- follower/following counts.

Do not assume list endpoints exist from the counts alone. First inspect the Oracle gateway/contracts for follower/following list reads. If they already exist, reuse them. If they do not, add the smallest Oracle-owned read contract needed for one reusable native connections screen; do not reintroduce Supabase or create two unrelated screens.

Desired native product shape:

- one reusable connections screen/modal for `المتابعون` and `يتابع`;
- person rows reuse existing public-profile presentation/routing where practical;
- empty/loading/error states are shared and Arabic-first;
- opening a person routes to the existing Public Profile rather than creating duplicate profile UI;
- follow/unfollow actions should reuse the existing social contract where useful, not fork a new mutation stack.

## Product/release work still after Followers / Following

Important remaining native/product/release work includes:

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
