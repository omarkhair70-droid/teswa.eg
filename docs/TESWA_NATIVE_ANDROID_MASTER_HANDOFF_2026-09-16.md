# Teswa Native Android — Master Continuation Handoff — 2026-09-16

> **READ THIS FIRST IN A NEW CHAT.** This is the continuation snapshot for the Teswa native Android migration after the current long chat reached its message limit. It is intentionally more complete than the normal PR description. Before changing code, also read `docs/TESWA_NATIVE_ANDROID_MASTER.md`, then re-check PR #523 and the current branch head because work may have advanced after this snapshot.
>
> Where this file and the older living master disagree about feature status, **this handoff is newer for the 2026-09-16 snapshot**. The older master remains useful for architecture/release invariants.

## 1. Exact repository / PR snapshot

- Repository: `omarkhair70-droid/teswa.eg`
- Canonical/base branch: `chore/oracle-runtime-cutover-prep-20260910`
- Active native branch: `feat/native-foundation-network-20260915`
- Active PR: **#523 — `Build Teswa native Android Oracle client`**
- Snapshot implementation head **before this handoff commit**: `ce2b1488a436c70fea562939d90842552112564a`
- Snapshot PR state: open, mergeable, not merged, 39 commits.
- Native Android root: `android-native/`
- Application/package ID: `com.teswa.mobile`
- Release identity: `versionCode 26`, `versionName 1.0.11`
- Existing Google Play signing identity must be preserved so native v26 updates the installed Teswa app without uninstalling.
- **Do not merge PR #523 unless Omar explicitly asks for the merge.**

The canonical base already contains the earlier merged native slices through #522. PR #523 contains the broad product migration work that followed.

## 2. Non-negotiable product philosophy

The migration rule is:

- **Expo = “what job/behavior existed?”** It is a behavioral/product reference only.
- **Oracle/Teswa backend = “what is the truth and contract?”** It owns durable data, business rules, ownership, validation, side effects, and production truth.
- **Native Android = “build the best new implementation of that job.”** It must not copy old Expo screen structure, visual debt, or architectural mistakes.

The goal is **capability parity + product improvement**, not screenshot parity.

The native app should become the best version of Teswa, not the old Teswa translated to Kotlin. It is Arabic-first, RTL-first, calm, clear, original, and should not look like Facebook Marketplace, Dubizzle, or a generic Material demo. Material 3 is an implementation substrate, not Teswa’s identity.

Before a major screen is built, ask:

1. What job is the user trying to complete?
2. What information is actually decision-critical?
3. What is the primary interaction?
4. What complexity from the old app can be removed?

If a user must understand internal architecture to use a feature, the product design failed.

## 3. Engineering architecture / guardrails

Native runtime rules:

- Kotlin + Jetpack Compose.
- Feature-oriented packages.
- `Repository/API/data -> StateHolder/ViewModel -> Compose screen/components`.
- No network calls inside Composables.
- One shared Oracle transport/authenticated execution boundary.
- Exactly one centralized session refresh and one retry after a 401.
- Do not scatter provider-specific transport/auth/storage logic across feature screens.
- Do not introduce Expo, React Native, Expo Updates, or Supabase into `android-native`.
- Android owns UX/device responsibilities; Oracle owns backend/data/business truth.
- Avoid clean-architecture theatre and premature microservices/modules. Keep a clean structured monolith until team/scale requires more.
- Prefer reusable feature primitives when they come from real repeated product needs, not abstraction for abstraction’s sake.

Current toolchain/invariants are documented in `docs/TESWA_NATIVE_ANDROID_MASTER.md`: JDK 17, Gradle 9.6 in CI, Kotlin 2.3.21, AGP 9.4.0 at this snapshot.

## 4. Build / verification rule — very important

During feature migration slices:

- run focused JVM/unit/contract tests;
- run Kotlin compile (`compileDebugKotlin`) as appropriate;
- do **not** repeatedly launch an emulator;
- do **not** repeatedly build APK/AAB artifacts.

The emulator/package cycle was deliberately removed from normal slice work because it wastes time and credits and adds little signal before the final gate.

Final release gate only:

1. full tests/lint/static/release hardening;
2. build an APK once for physical-device smoke where useful;
3. run critical flows on a real Android device;
4. build a **signed AAB v26** with existing Play signing identity;
5. upload it to **Google Play Internal testing**;
6. update/install through Google Play over the existing Teswa app without uninstalling;
7. complete production Oracle acceptance/cutover evidence;
8. only then do the final legacy cleanup PR.

Terminology: APK is for direct local install/smoke; AAB is the Play upload artifact. EAS profile/channel named `production` is **not** Google Play Production. At this snapshot there is no accepted native v26 Play release yet.

## 5. Closed old diagnostics — do not reopen

Do not spend new-chat time re-diagnosing the old Expo era unless fresh evidence proves a regression in the native implementation.

Closed/superseded threads include:

- old profile/policy encoded-comma mismatch and canonical stabilization;
- old stale EAS OTA/runtime mismatch and rollback debugging;
- the old forced Google sign-out/provider-vs-Oracle error confusion;
- old Expo/Edge/Coolify detours that were relevant to the legacy client, not the native architecture.

The migration itself is the resolution to most of that failure surface. New failures should first be classified as Android UI/state, Oracle API/backend, device integration, signing/Play, or push/deep-link issues rather than reopening Expo diagnostics.

Never request, paste, or commit access tokens, service-account secrets, Play signing material, or production credentials.

## 6. Merged foundation before PR #523

Historical merged sequence:

- #516 Canonical Stabilization.
- #517 native Android foundation.
- #518 Google + Oracle auth/session.
- #519 profile + policy account gate.
- #520 Oracle home feed.
- #521 home images + pagination + item detail.
- #522 authenticated app shell.

Canonical head after #522 was `c3789234468d0fff5ee4bffb44bdfb0f0e49ea8e`; PR #523 is based on that canonical branch and carries the later migration.

## 7. What PR #523 has already migrated

Do not redo these merely because the old Expo versions still exist as reference/rollback code.

### Core transport / auth / account

- centralized Oracle transport and errors;
- encrypted session restore;
- serialized/mutex-protected refresh;
- exactly one 401 refresh + retry;
- Google Credential Manager -> Oracle exchange;
- profile completeness gate;
- required policy acceptance gate;
- authenticated shell and native route handling.

### Home / marketplace / item

- Oracle home feed;
- images and pagination;
- item detail;
- optional Nearby using one-shot native location;
- refusal of location permission does not block the app;
- publish-location support so newly published items can participate in nearby results.

### Add Item

- persisted gallery selections and camera captures;
- local draft recovery per signed-in user;
- validation;
- streaming upload with known length;
- progress, cancellation, and compensating cleanup;
- exact Oracle publish contract;
- optional coordinates that are cleared when visible city/area changes so stale GPS data does not silently contradict the listing.

### Offers / deals

- offer creation;
- incoming/sent offers;
- think/reject/accept decisions;
- accepted-deal routing;
- deal inbox/thread;
- text messaging;
- read/unread state;
- confirmation/completion lifecycle;
- completed-deal review flow.

### Direct / contextual / voice

- direct message requests;
- accept/ignore/read;
- text sending;
- compose from a public profile, creating a request only when Send occurs;
- contextual/story-reply inbox and threads;
- shared voice layer across Deal + Direct + Contextual/Story paths;
- AAC local capture;
- microphone permission at point of use;
- two-minute recording limit;
- streaming private-media upload with progress;
- cleanup if message registration fails;
- authorized signed-URL playback for sender/receiver;
- server-side media authorization adjusted so the intended recipient can read direct and story-reply voice.

Voice landmark during the migration: `4179572`.

### Stories

- home story rail;
- signed image/video viewer;
- view + like;
- contextual text/voice reply;
- gallery image/video create;
- camera create;
- streaming upload + grant/complete/cleanup/rollback;
- owned story management/delete;
- viewer counts/list.

### Profile / social / settings / trust

- own profile editing;
- public profiles;
- active listing presentation;
- follow/unfollow;
- block/unblock;
- guarded own-listing archive/reactivate/delete lifecycle;
- privacy settings;
- notification preferences;
- blocked-user list;
- signout;
- all-or-nothing account deletion;
- gallery/camera avatar and cover replace/remove with progress and cleanup;
- public trust level/score;
- completed deals;
- ratings;
- response rate/signals;
- badges;
- completed-deal review authoring: 1–5 stars, description/communication/commitment/respect signals, optional comment, duplicate prevention, reviewer identity bound to session.

### Notifications / FCM / deep-link foundation

- in-app notification center;
- read/read-all;
- native destination mapping;
- modern FCM device registration using Firebase Installation ID;
- device disable on signout;
- local notification/tap handling foundation;
- Oracle notification worker can preserve legacy Expo delivery while routing Android `fcm:` devices through FCM HTTP v1;
- service-account secrets are intentionally not committed.

This is implementation foundation, **not production push acceptance**. Physical-device background/killed-process delivery, service-account provisioning outside repo, deploy, send/tap proof, and verified App Links remain release gates.

### Discover 2.0

The old Discover UI was not ported. Native Discover was rebuilt around the job of discovery:

- Oracle-backed search;
- category/condition filtering;
- pagination;
- discovery sections;
- reuse of native Nearby;
- reuse of native Stories;
- item routing to native Item Detail;
- People entry;
- clear boundary for Motion / City Pulse.

Landmarks from the migration include `96bb7d6` for the first Discover foundation and `816edff` for its immediate compile/CI fix.

### People

- Oracle people directory/search;
- sanitized query;
- refresh;
- pagination/deduplication;
- name/username/city/area fields from the real contract;
- routing to the existing native Public Profile rather than creating duplicate profile UI.

A People slice landed around `41bb15b9`.

### Motion / City Pulse

Motion was treated as product activity/pulse rather than copied as an old screen:

- moving items;
- story discovery;
- video discovery;
- independent partial-failure handling so one source does not collapse the whole surface;
- current-city pulse resolution using native location/reverse-geocoding where applicable;
- people/story-author presence;
- reuse of Item Detail, Public Profile, Stories, and native location.

A Motion/City Pulse slice landed around `efc370144`.

## 8. Dolab — product intent (do not copy the legacy UI)

Dolab is important. The old product had a good concept but a poor information architecture: Shelf + Notes/self-chat + Media + Inbox + Drafts/Ready + Issues + Collections + sync/provider concerns all competed as if they were separate mini-products. It felt like a system inside the system.

The new concept is:

> **Dolab is a private personal object workspace before the marketplace.**
>
> Arabic product line: **“دولابي — مساحتك الخاصة قبل السوق.”**

Think of it as a **personal object workspace / digital drawer**, not a product grid and not a warehouse admin UI.

Desired mental model:

- one Shelf/workspace containing the user’s things;
- `+ احفظ حاجة` is the obvious creation entry;
- each saved thing is one object with its own context;
- inside the object: media, note/context, optional voice, status, and simple history;
- primary useful actions: `كمّل كإعلان`, add a note, use/select it in messaging, archive/delete;
- self-chat becomes context *inside* an object rather than a separate subsystem;
- media belongs to the object rather than being a separate destination the user must understand;
- status is a property/filter, not a whole architecture the user must navigate;
- Collections may exist later as secondary organization only if they prove valuable;
- never recreate a navigation maze like `Collections -> Media -> Inbox -> Drafts`.

Product criterion agreed in the chat:

> **“لو المستخدم محتاج يفهم Architecture الدولاب عشان يستخدم الدولاب، يبقى التصميم فشل.”**

Legacy behavior worth preserving as capability reference is documented in `docs/dolab-current-state-audit.md`. Legacy concepts included `dolab_items`, `dolab_media`, `dolab_notes`, statuses such as draft/ready/published/exchanged/archived, sources such as manual/camera/gallery/share/note/voice, and bridges from Add Item and Direct chat. **Do not restore direct Supabase access in native Android.**

## 9. Dolab — exact current implementation status at snapshot

Dolab has already started and is **substantial but not finished**. Do not assume it is complete just because the Profile entry now exists.

Current native package:

`android-native/app/src/main/java/com/teswa/mobile/feature/dolab/`

Files present at this snapshot:

- `DolabModels.kt`
- `DolabRepository.kt`
- `DolabStateHolder.kt`
- `DolabScreen.kt`
- `ProfileDolabHost.kt`

Latest snapshot implementation commit `ce2b1488a436c70fea562939d90842552112564a` is titled:

`Expose Dolab as a first-class profile workspace entry`

It wires a clear Dolab entry from the profile into the native shell/workspace.

### Dolab models currently implemented

`DolabItemStatus`:

- DRAFT
- READY
- PUBLISHED
- EXCHANGED
- ARCHIVED
- UNKNOWN

Native models exist for:

- `DolabItem`
- `DolabMedia`
- `DolabNote`
- status filters
- workspace state
- selected-item detail state

Item fields currently cover identity/owner/title/description/category/status/source/sourceRef/metadata/timestamps. Media and notes have first-class models rather than being UI strings.

### Dolab Oracle repository currently implemented

The Android repository uses the shared Oracle client, not Supabase. Current native calls include:

- `GET /v1/dolab/items?limit=100&offset=0&status=...`
- `GET /v1/dolab/items/{id}`
- `POST /v1/dolab/items`
- `PATCH /v1/dolab/items/{id}`
- `DELETE /v1/dolab/items/{id}`
- `GET /v1/dolab/items/{id}/media`
- `DELETE /v1/dolab/media/{mediaId}`
- `GET /v1/dolab/items/{id}/notes`
- `POST /v1/dolab/items/{id}/notes`
- `DELETE /v1/dolab/notes/{noteId}`

Repository parsing handles items/media/notes and metadata through the existing Oracle/session boundary.

### Dolab StateHolder currently implemented

Current state logic includes:

- load / refresh workspace;
- select an item;
- create an item (manual/draft default path);
- update item;
- update status;
- archive;
- delete;
- load detail (item + media + notes);
- add/delete note;
- status filtering;
- search filtering;
- Arabic user-facing messages/errors;
- per-operation mutation state.

### Dolab UI currently implemented

`DolabScreen.kt` already has an Arabic-first workspace skeleton rather than the old UI:

- title `دولابي`;
- subtitle `مساحتك الخاصة قبل السوق`;
- `احفظ حاجة` creation action;
- refresh;
- horizontal status filters;
- search field `دوّر في حاجتك`;
- loading/error/empty states;
- object cards with title/description/category/status/source/update time;
- selected-object detail area;
- status chooser;
- notes timeline;
- add-note input;
- archive/delete/create flows;
- a `كمّل كإعلان` action hook exists at screen level.

### Dolab is NOT finished yet — known gaps

These are concrete, not theoretical:

1. **Media UX/upload is incomplete.** `DolabScreen` currently has a placeholder media section. With no media it says roughly that media will appear after secure upload is connected; with media it only reports a count. There is not yet the intended rich image/video/audio capture/upload/preview experience.
2. **Dolab -> Add Item handoff is not fully wired.** `DolabScreen` exposes an `onContinueAsListing` callback, but `ProfileDolabHost` currently opens the screen without supplying the real Add Item/prefill bridge. The next implementation must connect this deliberately rather than opening Add Item empty.
3. **The publish relationship must remain traceable.** The new listing should preserve the source Dolab object relationship, and successful publish should update/mark Dolab state through the real Oracle contract rather than silently duplicating data.
4. **Messaging integration is still pending.** The old product could save/use/choose from Dolab in chat. Native should eventually support sensible `Save to Dolab` / `Choose from Dolab` behavior without embedding a second Dolab UI in messaging.
5. **Voice/audio-as-object-context is not yet a finished Dolab experience.** Reuse the shared native voice/media foundations where it improves the object workspace; do not fork another recorder/upload stack.
6. **Collections are intentionally not a blocker.** Do not rebuild them first. Only add secondary organization if the simpler object workspace proves it needs it.
7. Physical-device/storage acceptance remains later; current code/tests/compile do not prove camera/gallery/object-storage behavior in production.

## 10. Exact next task for a new chat

Start by re-checking the current PR #523 head. If no later work has already closed these gaps, continue Dolab as a coherent product slice in this order:

1. **Finish Dolab media around the object, not around a separate Media screen.** Reuse the existing Oracle media boundary and native streaming patterns. Support appropriate image/video/audio selection/capture/preview/delete with ownership-safe cleanup. Do not read large video files wholly into memory. Do not guess-delete old external objects.
2. **Wire `كمّل كإعلان` to the existing Native Add Item flow with prefill.** Reuse the current Add Item implementation instead of creating a second publisher. Prefill only fields that are actually supported/known (e.g. title, description/context, owned media/location where contractually valid). Carry a `dolabItemId`/source relationship through the real contract. Do not invent payload fields before inspecting backend contracts.
3. **After successful publish, preserve/mark the Dolab relationship/status** through Oracle. Failure must leave the private object recoverable and must not falsely mark it published.
4. **Add the messaging bridge only after the workspace/publish path is coherent.** Use a small reusable picker/selection entry for `Choose from Dolab`; support `Save to Dolab` from relevant chat/media contexts where the backend contract allows it. Do not put the entire workspace UI inside chat.
5. Add focused repository/state contract tests and Kotlin compile. No emulator/APK/AAB during the slice.
6. Commit and push coherent checkpoints to `feat/native-foundation-network-20260915`. Do not merge #523 without explicit permission.

Do not begin by redesigning the screen again. The product direction is established; finish the missing behavior cleanly, then judge the rendered experience as one workspace.

## 11. Product work after Dolab

After Dolab is genuinely complete enough for the intended v26 product, the important remaining product surfaces are:

### Full Edit Listing Native

Current owner lifecycle covers archive/reactivate/delete, but full content editing still needs a coherent Native flow if it has not been added by a later commit. Reuse Add Item components/contracts rather than cloning a second giant editor. Expected editable capability should be confirmed against the real Oracle contract: title/description/condition/category/wanted intent/location/media where supported.

### Trust & Safety / Reporting

Blocking and reviews exist. Reporting still needs complete native coverage if not added later:

- item;
- profile/user;
- story;
- direct/contextual message/thread where product requires;
- deal.

Admin moderation does not need to be forced into the consumer Android app; web/admin tooling is a better fit unless the product requirement says otherwise.

### Followers / Following lists

Follow/unfollow exists. If not added later, build one reusable connections surface for followers/following rather than two unrelated screens.

### Final Home / navigation / presentation

Do this **after** the big domains are real so navigation follows the product rather than guessing early.

Current product direction discussed in the chat:

- `Home | Discover | + | Messages | Profile`
- Notifications as a bell/badge + Notification Center rather than spending a bottom-nav slot.
- Dolab prominently accessible from Profile and potentially Home.
- People and Motion live inside the Discover world rather than becoming unrelated bottom tabs.

This is direction, not permission to throw away working routes. Reconcile it with the current shell and actual product usage before finalizing.

### Final UI/state quality

Before release, review the whole native app for:

- Arabic/RTL consistency;
- dark mode;
- reusable loading/empty/error/offline states;
- media performance;
- route consistency;
- no placeholder screens or duplicate domain logic;
- selective offline/cache behavior where it materially improves Discover/People/Motion;
- minimal crash/analytics observability appropriate for release;
- legal/community/settings entries that remain product-required.

## 12. Push / deep links / notification hardening still required

Code foundation is not acceptance.

Before release:

- provision FCM service-account/credentials outside the repository;
- deploy the Oracle worker with delivery enabled according to the production plan;
- verify token registration/refresh/disable;
- verify foreground/background/killed-process notification delivery on a physical device;
- verify tap routing from a cold start;
- verify Teswa HTTPS App Links/domain association on device;
- verify custom/internal routes that remain product-required;
- add story/Dolab/discovery routes only where they have real external-entry product value.

Architecture hardening item to keep visible: some migrated flows historically performed durable mutation first, then made a separate **best-effort client request** to create a notification. The desired end-state is server-owned/idempotent side-effect generation from the durable mutation/event pipeline wherever the backend contract supports it. Android should not become the authority for notification truth. Harden this before final production cutover rather than duplicating more client-side notification fabrication.

FCM is a delivery courier, not the business backend. Oracle owns notification history/read/unread/business state.

## 13. Release acceptance boundary

Do not say “Teswa native is done” merely because JVM tests and Kotlin compile are green.

Physical-device acceptance must cover the real critical flows, including at minimum:

- Google sign-in;
- session restore and refresh;
- profile/policy gates;
- Home/Discover/People/Motion;
- camera/gallery and media upload;
- Add Item including location behavior;
- item detail;
- offers/deals/reviews;
- Direct + Contextual + voice;
- Stories create/view/reply/manage/viewers;
- Nearby/location permission allowed and denied paths;
- profile avatar/cover;
- Dolab critical paths once finished;
- notification permission, push receive, background/killed-state receive, and tap routing;
- deep links/App Links;
- signout/account controls.

Release/static work still includes deliberate review of things already noted in the project such as target API requirements, app icon/data-extraction rules, Credential Manager/deprecation cleanup, code shrinking, dependency review, locale/font/image performance, and static/lint findings.

## 14. Oracle cutover / Supabase retirement

Do not remove the legacy runtime simply because the Native source no longer imports it.

Supabase remains production/rollback authority until explicit Oracle production acceptance/cutover evidence exists. The final retirement is a separate cleanup PR after:

- native product parity for required v26 scope;
- signed AAB with existing Play identity;
- update-over-installed-app success through Play Internal testing;
- real-device critical-flow smoke;
- production Oracle acceptance;
- push/deep-link/background acceptance;
- rollback procedure documented and agreed.

Then the cleanup PR can remove/archive active mobile legacy pieces:

- Expo runtime/build dependencies;
- Expo Updates/EAS mobile workflows;
- React Native mobile packages no longer used;
- active Supabase mobile adapters and provider-specific mobile variables;
- stale env/config/scripts/assets/docs that imply the legacy runtime is still active.

Preserve git history. Do not claim “zero bugs”; the target is no known legacy runtime dependency, green gates, and a controlled release/cutover.

## 15. Important workflow / communication preferences for continuation

When continuing with Omar:

- give direct, practical status in Egyptian Arabic;
- distinguish clearly between **local Codex work**, **pushed GitHub PR work**, and **merged canonical work**;
- verify current GitHub state before claiming a commit/feature is pushed or merged;
- do not reopen closed diagnoses without fresh evidence;
- do not repeatedly ask him to run broad command sets; if a local manual step is truly needed, give one clear step at a time;
- prefer actual implementation/results over long plans;
- do not interrupt a coherent slice to rebuild already-closed features;
- if discussing design, use bold/original product thinking but label speculation and keep the real Oracle contract authoritative;
- never merge #523 unless he explicitly asks.

## 16. New-chat bootstrap prompt

A new chat can start with this:

```text
Continue Teswa Native Android from PR #523 on branch feat/native-foundation-network-20260915.

Read docs/TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-16.md first, then docs/TESWA_NATIVE_ANDROID_MASTER.md, then re-check the current PR head before coding.

Do not redo completed Auth, session/account gates, Home, Add Item, Nearby/location, Offers, Deals, Reviews, Direct/Contextual messaging, shared Voice, Stories, Profile media/trust, Settings, Notifications/FCM foundation, Discover 2.0, People, or Motion/City Pulse.

Dolab Native 2.0 is partially implemented and is the active product slice. Preserve its product thesis: a simple private personal object workspace before the marketplace, not a port of the old complex Dolab UI.

First inspect the current feature/dolab implementation and backend contracts. If the handoff gaps are still open, finish object media, Dolab -> Add Item prefill/source relationship, publish-state reconciliation, then the minimal messaging bridge. Reuse existing native media/Add Item/voice capabilities; do not introduce Supabase into android-native.

Use focused tests + Kotlin compile only during slices. No emulator, APK, or AAB until the final release gate. Commit and push coherent slices to the existing PR branch. Do not merge the PR without explicit approval.
```

## 17. Final principle

**Do not optimize for saying “migration complete.” Optimize for making the Native + Oracle Teswa simpler, more coherent, more reliable, and better to use than the app it replaces.**
