# TESWA Product Reality Audit — Company Production
Date: 2026-09-03
Branch: `audit/product-reality-20260903`
Repository: `omarkhair70-droid/teswa.eg`
Audit start HEAD: `14e7198ec42f33bf0fca781c0c5c0502c628b786`
Branch parent observed at audit start: `de31ced1a089021ecffa717bb1918e4aad7f85f6`

## 0. Lane contract

This audit follows `docs/TESWA_COMPANY_CLOSURE_PARALLEL_PLAN_2026-09-03.md`.

- Lane 1 is audit/documentation only at this stage.
- No product implementation is changed in this commit.
- No merge to `main`.
- No destructive backend/Supabase work.
- No redesign is proposed before product reality is classified.
- Existing product code is judged as `KEEP / FIX / REBUILD / DELETE`.
- Static-code findings are separated from items that require real-device/runtime verification.

## 1. Executive verdict

Teswa is already a real production-shaped product. The current branch contains coherent first-launch gates, marketplace discovery, item publishing with draft recovery, swap offers, deal coordination, unified messaging, stories, profile/trust, notifications, privacy/safety controls, and a substantial Dolab workspace.

**Do not start a broad redesign.**

The company-closure direction should be:

1. **KEEP the product architecture and the majority of the user-facing surfaces.**
2. **FIX a small number of production-reliability and completeness gaps.**
3. **REBUILD cross-cutting recovery contracts, not whole screens.**
4. **DELETE or retire duplicate/orphan/stale surfaces after dependency verification.**
5. Run the runtime matrix at the end because several production claims cannot be proven from static code alone.

There are **no static-code P0 data-loss/security launch blockers proven by this audit**. There are, however, P1 reliability gaps that should close before calling the mobile product fully production-closed.

## 2. Severity model

- **P0 — Release blocker:** account/data/safety failure, destructive behavior, core journey impossible.
- **P1 — Major production gap:** a normal journey can lose user work or fail without adequate recovery.
- **P2 — Quality/completeness gap:** feature works, but an important state, history, recovery path, or completeness expectation is missing.
- **P3 — Cleanup/debt:** duplicate/orphan surface, stale documentation, minor inconsistency, or low-risk polish.

Status markers:
- **CONFIRMED-STATIC** — directly demonstrated by current branch code.
- **RUNTIME-VERIFY** — must be tested on a device/network/backend; not claimed as a confirmed bug.

---

# 3. End-to-end product map

| Surface | Verdict | Reality | Required closure |
|---|---|---|---|
| App open / root gate | **KEEP + FIX** | Bootstrap, cached account gate, profile/policy checks, stall timeout + retry, deferred startup work and push-route queuing are present. | Remove first-launch route handoff ambiguity between Adventure and Onboarding; real-device cold/warm start verification. |
| Adventure / first visual entry | **KEEP + FIX** | One-time entrance with skip/mute exists. | Route intentionally to Onboarding rather than briefly targeting Login and relying on root guard correction. |
| Onboarding | **KEEP** | 3-step explanation, skip, completion persistence, Login handoff. | Runtime first-install sequence verification. |
| Login | **KEEP** | Email/password + Google, email-confirmation error copy, loading states. | Runtime Google/native + bad-network verification. |
| Signup | **KEEP** | Password validation, confirmation state, resend confirmation, Google path. | Runtime duplicate email/rate-limit/confirmation delivery verification. |
| Profile setup | **KEEP** | Username validation, conflict handling, 12s timeout + one retry. | Runtime timeout/back-end policy verification. |
| Policy acceptance | **KEEP** | Explicit Terms + Community Guidelines acceptance, privacy link, persisted server acceptance. | Verify legal version rollover behavior at runtime/backend. |
| Home | **KEEP** | Living-world hero, next-action logic, stories, video rail, latest items, dashboard errors/retries, cache notice. | Validate hierarchy/runtime pacing; no structural rebuild justified. |
| Discover | **KEEP** | Search/filter/pagination, true server-side 3 km nearby via M48.1 RPC, loading/error/empty states. | Real-device location permission and low-density 3 km behavior. |
| Item detail | **KEEP** | Product detail, owner/context/action paths are present. | Runtime invalid/deleted/reserved/blocked-user/share deep-link matrix. |
| Add / publish | **KEEP + FIX** | Multi-step publishing, local draft recovery including image restoration, offline failure preservation, publish progress. | Persist/restore optional video teaser or make its non-durable state impossible to lose unexpectedly. |
| Offers | **KEEP** | Create → pending/thinking/reject/accept states are explicit; accepted offer opens deal. | Runtime double-action/race verification. |
| Deals | **KEEP + REBUILD recovery** | Coordinating chat, text retry, voice, realtime reconnect state, block/report, two-party completion, review path. | Preserve failed voice recordings as retryable drafts. |
| Messages inbox | **KEEP** | Unified direct/deal/story inbox + Offers mode, filters/search/unread/request state. | Runtime scale/realtime and long-list verification. |
| Direct chat | **KEEP + REBUILD recovery** | Requests, pagination, realtime, text/media/files/voice, optimistic failed text retry, reply, safety, Dolab bridge. | Preserve failed voice recording; permission-denial recovery; Dolab picker completeness. |
| Stories | **KEEP** | Viewer, media loading fallback, likes/replies, voice draft, safety/report, owner management. | Runtime media autoplay/permission/expiration matrix. Story voice already preserves draft on send failure and should be the reference behavior. |
| Profile / trust | **KEEP + FIX** | Public profile, cache fallback, follow graph, trust/badges, stories, listings, block/report/message. | Give access to more than the first 6 active listings. |
| Notifications center | **KEEP + FIX** | Typed visual taxonomy, read/read-all, deep-link resolution, error/retry. | Add history pagination/archive access beyond latest 50. |
| Notification settings | **KEEP** | Per-category preferences + quiet hours + device permission status, registration and Open Settings recovery. | Runtime push permission/token/deep-link matrix. |
| Settings / privacy / safety | **KEEP** | Account, profile edit, notification settings/center, direct privacy, blocked users, legal, conditional admin reports. | Runtime account deletion/logout/biometric/device permission matrix. |
| Dolab workspace | **KEEP + FIX / targeted REBUILD** | Local-first workspace, drafts/media/notes/inbox/collections, cloud snapshot, publish/share bridge, persistence warnings. | Merge local + cloud picker results; add first-class generic-file persistence if product promises generic file save. |
| Standalone `/direct` inbox | **DELETE candidate** | Unified Messages tab is current inbox; no internal exact `/direct` navigation reference was found in repository search. | Verify external/deep-link consumers, then retire route instead of maintaining two inboxes. |

---

# 4. Severity-ranked confirmed findings

## P1

### PR-001 — Direct and Deal voice recordings can be lost after send/upload failure
**Status:** CONFIRMED-STATIC  
**Verdict:** REBUILD recovery contract, keep both chat screens.

Affected:
- `app/direct/[id].tsx`
- `app/deal/[id].tsx`

Reality:
- Both flows call recorder `stop()`, capture the local URI, then attempt upload/send.
- On failure they clear recording-active state and show an error/toast.
- There is no retained `voiceDraft`/retry object exposed to the user after the failed send.
- A user can therefore record a long voice message, hit a temporary upload/network error, and have no in-product retry path for the captured recording.

Reference behavior already exists:
- `app/story/[userId].tsx` stores a `voiceDraft` and leaves it intact when `sendStoryVoiceReplyFromMobile` fails.

Required closure:
- Build one shared retryable voice-draft contract for Direct + Deal.
- Preserve local URI, duration, MIME, size and intended target until success or explicit discard.
- Retry must not require re-recording.
- Clean abandoned local files intentionally.

### PR-002 — Dolab “choose from my Dolab” can hide cloud-only content whenever any local shareable exists
**Status:** CONFIRMED-STATIC  
**Verdict:** FIX / targeted REBUILD picker data source.

Affected:
- `lib/dolab/chat-bridge.ts`
- Direct chat Dolab selector consumers.

Reality:
- `loadRecentDolabShareables()` builds up to 10 local items.
- If `localItems.length > 0`, it returns immediately.
- Remote `dolab_items / dolab_media / dolab_notes` are fetched only when the local bridge is empty.

Impact:
- A signed-in user with one local note can be unable to choose a cloud Dolab item that exists on another device or only remotely.
- This is a completeness bug in a user-facing “من الدولاب” mental model, not just implementation preference.

Required closure:
- Load local immediately for speed, then merge remote results.
- Deduplicate stable IDs/content references.
- Preserve fast first paint without turning local cache presence into a cloud-content visibility gate.

---

## P2

### PR-003 — Add-item video teaser is excluded from draft recovery
**Status:** CONFIRMED-STATIC  
**Verdict:** FIX.

Affected:
- `app/(tabs)/add.tsx`

Reality:
- Add has mature draft persistence and can restore listing fields + image assets.
- UI explicitly says: **“فيديو اللمحة لا يُحفظ ضمن المسودة حاليًا، فاختاره قبل النشر النهائي.”**
- Closing/crashing/leaving after choosing the teaser loses that optional work while the rest of the draft survives.

Required closure:
- Persist a durable teaser draft reference with validation metadata, or defer teaser selection to a final non-draft step that clearly cannot be mistaken as saved work.

### PR-004 — Camera/mic/media permanent-denial recovery is inconsistent and can dead-end feature actions
**Status:** CONFIRMED-STATIC for Direct/Deal behavior.  
**Verdict:** REBUILD shared permission-recovery component.

Affected examples:
- `app/direct/[id].tsx`
- `app/deal/[id].tsx`

Reality:
- Direct explicitly requests media library/camera/microphone permissions.
- Deal requests microphone permission.
- Denial paths currently show toast/copy and return.
- They do not distinguish a permanently denied state and do not offer `Linking.openSettings()`.
- Notification permissions already have a production-grade model in `components/settings/NotificationPermissionCard.tsx`: it distinguishes `canAskAgain` and offers **فتح إعدادات الجهاز**.

Required closure:
- Reuse one permission state model across microphone/camera/media/location where platform semantics require it.
- “Denied once” and “blocked in system settings” must not look identical.
- Permanent denial needs a direct Open Settings action.

### PR-005 — Notifications history is capped at latest 50 with no pagination
**Status:** CONFIRMED-STATIC  
**Verdict:** FIX.

Affected:
- `lib/notifications.ts`
- `app/notifications.tsx`

Reality:
- `fetchMyNotifications()` uses `.limit(50)`.
- The notification center has no older-page loader/history cursor.

Impact:
- Older safety/report/product notifications silently disappear from in-app history once the user crosses 50 records.

Required closure:
- Cursor pagination or an explicit retention/archive contract.
- Preserve read state and deep-link behavior across pages.

### PR-006 — Public profile exposes only 6 active listings with no path to the rest
**Status:** CONFIRMED-STATIC  
**Verdict:** FIX.

Affected:
- `app/profile/[id].tsx`

Reality:
- Calls `fetchPublicProfileActiveListings(id, 6)`.
- Renders those listings.
- No “see all”/pagination route is exposed from that card.

Impact:
- Active items beyond six become undiscoverable from the owner’s profile.

Required closure:
- Add “عرض كل العناصر” to a paginated owner listing surface, or paginate in place.

### PR-007 — Adventure targets Login even though the root contract requires unfinished Onboarding first
**Status:** CONFIRMED-STATIC  
**Verdict:** FIX.

Affected:
- `app/(auth)/adventure.tsx`
- `app/_layout.tsx`

Reality:
- Adventure `onStart` and `onSkip` mark the one-time entrance seen, then `router.replace('/(auth)/login')`.
- Root guard says: when unsigned + Adventure seen + `onboardingCompleted === false`, route to `/(auth)/onboarding`.

Impact:
- The destination requested by Adventure contradicts the canonical route guard and relies on a second redirect to repair navigation.
- This creates avoidable first-run transition/flicker/race risk.

Required closure:
- Adventure should hand off directly to Onboarding when onboarding is incomplete.
- Keep root guard as safety, not as the normal second redirect.

### PR-008 — Dolab cannot first-class save local generic documents even though Direct supports generic file attachments
**Status:** CONFIRMED-STATIC  
**Verdict:** Targeted REBUILD if “save any file to Dolab” is part of product promise; otherwise FIX copy/scope.

Affected:
- `lib/dolab/chat-bridge.ts`
- Dolab schema/persistence dependency.

Reality:
- Image/video/audio have first-class Dolab media handling.
- Remote generic files can be retained as metadata/reference notes.
- Local generic files that are not image/video/audio return **“نوع الملف ده لسه مش مدعوم في الدولاب.”**
- Direct chat itself has a generic Files picker.

Required closure choice:
1. Product supports generic documents → introduce first-class generic file representation/storage with size/type/retry rules.
2. Product intentionally does not → make “حفظ في دولابي” capability copy/type affordances explicit before the user hits failure.

---

## P3

### PR-009 — Standalone Direct inbox appears orphaned/redundant
**Status:** CONFIRMED-STATIC internal-reference audit; external deep links still RUNTIME/DEPENDENCY-VERIFY.  
**Verdict:** DELETE candidate.

Affected:
- `app/direct/index.tsx`

Reality:
- The product now has a unified `/(tabs)/messages` inbox for direct/deal/story conversations and offers.
- Repository search found no exact internal navigation to `/direct`.
- Conversation routes `/direct/:id` and compose routes remain valid and must not be removed.

Required closure:
- Check push/deep-link/public URL history.
- If no consumer depends on the index route, delete/redirect it to unified Messages.

### PR-010 — M48 location-truth documentation is stale after M48.1
**Status:** CONFIRMED-STATIC  
**Verdict:** DELETE/archive/supersede stale statement, not product code.

Reality:
- `docs/M48_REAL_DEVICE_QA_RUNTIME_FEEL_AND_NATIVE_POLISH.md` says nearby is term-based and not a true 3 km radius.
- Current code in `lib/marketplace-items.ts` calls `get_nearby_marketplace_items` with radius.
- M48.1 migration/docs introduced precise coordinates + Haversine server-side radius.
- Discover’s current “3 km” copy is therefore consistent with current implementation, assuming migration is deployed.

Required closure:
- Mark M48 A4 as superseded by `docs/M48_1_TRUE_NEARBY_RADIUS_DISCOVERY.md`.
- Runtime/deployment proof remains required for the RPC.

---

# 5. KEEP findings — do not rewrite these unnecessarily

## Auth/account gate
Keep:
- Root bootstrap gating.
- Cached account gate with background revalidation.
- 6s stalled-account-state fallback and retry.
- Email confirmation state and resend.
- Profile username collision handling.
- Required policy acceptance.
- Public legal/compliance bypass.
- Deferred push/startup work.

## Home
Keep:
- Next-best-action logic.
- Separate failure states for dashboard/stories/video/feed.
- Query cache/offline notice.
- Strong entry points to Add/Discover/Messages/Notifications/Dolab/Profile.

Do not rebuild Home merely because visual authorship may evolve later.

## Discover
Keep:
- Paginated general browse.
- Server-side 3 km path.
- Category/condition/query filters.
- Explicit loading/error/empty behavior.

## Offers and Deals
Keep:
- Pending/thinking/soft reject/accept lifecycle.
- Accepted offer → deal.
- Two-party completion confirmation.
- Review path.
- block/report.
- Text send failure retry.

Only voice recovery needs structural attention.

## Messages
Keep unified inbox as canonical:
- direct
- deals
- story-context threads
- requests
- unread filters
- offers mode

## Stories
Keep:
- separate image/video readiness.
- signed media failure fallback.
- like/reply/safety controls.
- voice draft retention on failed send.
- owner management path.

## Notifications
Keep:
- current typed taxonomy.
- deep-link resolver by direct/deal/offer/item/context/profile.
- mark read / mark all.
- device permission card, token state, Open Settings recovery.
- category preferences and quiet hours.

## Profile/trust
Keep:
- cache fallback.
- trust metrics/badges.
- follow graph.
- block/report/message.
- active stories + listing presence.

## Dolab
Keep the workspace. It is not a placeholder:
- local persisted workspace
- inbox
- drafts
- media
- notes/self-chat
- collections
- share bridge
- publish bridge
- remote snapshot
- sync/error state
- persistence warning
- saved remote media URLs

Do not replace Dolab architecture merely because two integration gaps remain.

---

# 6. REBUILD scope — deliberately narrow

Do **not** use “REBUILD” as permission to redesign Teswa.

The justified rebuilds are cross-cutting contracts:

1. **Retryable voice draft layer**
   - Direct + Deal use same durable pending recording model.
   - Story implementation is behavioral reference.

2. **Permission recovery layer**
   - Permission snapshot: granted / askable / permanently denied / unsupported.
   - Consistent Open Settings action.
   - Shared copy and analytics.

3. **Dolab shareable aggregation**
   - local-first render
   - remote merge
   - dedupe
   - loading/error/refetch state
   - never hide cloud library because local cache is non-empty

4. **Generic-file Dolab representation** only if product scope explicitly promises it.

Everything else should stay incremental.

---

# 7. DELETE / retire candidates

1. `app/direct/index.tsx` after external-dependency verification.
2. Stale location limitation statement in pre-M48.1 docs; mark superseded rather than letting two truths coexist.
3. Any duplicate legacy inbox entry point that routes around unified Messages.
4. Dead feature/test entry points must only be deleted after checking production env flags; Native Google diagnostics is already hidden behind `EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE` and 7-tap unlock, so it is **not** currently a product DELETE finding.

---

# 8. Runtime verification queue

Static audit cannot prove device/backend behavior. These must be executed before product closure.

## First install / auth
- clean install → Adventure → Onboarding → Login/Signup
- Adventure Start and Skip
- Onboarding Skip and complete
- signup with confirmation required
- resend confirmation
- confirmed login
- Google sign-in cancel/success/failure
- profile username duplicate
- profile save timeout
- policy acceptance network failure
- cold start after every gate state

## Home / Discover
- cold/warm Home first content
- offline cached Home
- 3 km RPC deployed and callable in production
- nearby with no coordinate-bearing listings
- permission denied / permanently denied
- pagination after nearby and filters
- Discover zero results / network loss / retry

## Item / Add
- deleted item deep link
- item changes state while detail open
- blocked owner
- share route from external app
- Add app-kill on every step
- image draft restore
- teaser-loss case before fix
- offline publish attempt
- partial media upload failure
- retry after network restoration

## Offers / Deals
- two-device offer send/receive
- simultaneous receiver actions
- accepted offer creates exactly one deal
- deal realtime disconnect/reconnect
- text failed-send retry
- voice upload failure after 30–120s recording
- both completion-confirmation orderings
- block during active deal
- review after completed

## Messages / Direct
- request → accept → compose
- long direct thread pagination
- direct realtime
- media/file size/type limits
- camera/library/mic permanent denial
- upload failure after pending attachments
- voice failure draft preservation after fix
- Dolab selector with: local only / remote only / both local+remote

## Stories
- image/video create
- expired story
- media 404/signed URL failure
- swipe/tap/hold playback
- text reply
- voice reply failure and retry
- block/report
- own-story manage/delete/viewers

## Profile
- cached public profile while offline
- >6 active listings
- follow/unfollow race
- blocked states
- trust/badge fetch failure
- story/listing presence fetch partial failure

## Notifications / Settings
- push denied askable
- push permanently denied → Open Settings
- token missing while permission granted
- each high-value notification route
- >50 notifications after pagination fix
- read/read-all rollback on failure
- quiet hours crossing midnight
- privacy changes
- blocked users
- logout
- biometric lock
- account deletion

## Dolab
- device-only signed-out mode
- local write failure warning
- cloud refresh failure
- local + remote aggregation
- upload too large
- image/video/audio save
- generic document behavior
- publish bridge
- share to direct conversation
- delete remote item/media/note
- app restart with pending sync/error items

---

# 9. Lane briefs

## Brief A — Reliability closure
Priority: P1  
Own:
- retryable voice drafts for Direct/Deal
- real-device network failure tests

Dependencies:
- storage cleanup policy
- direct/deal service functions
- Lane 2 backend/provider boundary decisions if those functions move behind Teswa-owned services

## Brief B — Dolab completeness
Priority: P1/P2  
Own:
- merged local+remote shareable picker
- generic file decision
- multi-device truth tests

Dependencies:
- current Dolab schema/storage
- Lane 2 backend boundary

## Brief C — Permission recovery
Priority: P2  
Own:
- shared permission state component
- microphone/camera/media/location integration
- Open Settings behavior

Reference:
- `NotificationPermissionCard`

## Brief D — History/discoverability completeness
Priority: P2  
Own:
- notifications pagination
- public-profile all-listings path

## Brief E — First-run routing cleanup
Priority: P2  
Own:
- Adventure → Onboarding direct handoff
- verify zero flash/race from clean install

## Brief F — Deletion/debt
Priority: P3  
Own:
- verify `/direct` index external consumers
- redirect/delete duplicate inbox
- supersede stale M48 location statement

---

# 10. Cross-lane dependency notes

This audit deliberately does not refactor direct Supabase usage.

However, the company closure plan says new product/backend work should depend on Teswa-owned domain interfaces. Several existing screens/services still call Supabase directly (including realtime). When implementing findings from this audit:

- Do not deepen direct provider coupling.
- Coordinate service-boundary work with Lane 2.
- Do not use Lane 1 as an excuse for backend cutover.
- Keep product behavior stable while provider ownership changes underneath.

---

# 11. Closure order

Recommended execution order:

1. **PR-001** voice draft loss.
2. **PR-002** Dolab local/cloud visibility.
3. **PR-007** first-run handoff.
4. **PR-003** Add teaser draft continuity.
5. **PR-004** permission recovery.
6. **PR-005** notifications pagination.
7. **PR-006** profile listing completeness.
8. **PR-008** generic-file scope decision.
9. **PR-009 / PR-010** cleanup.
10. Full runtime matrix, then reclassify any RUNTIME-VERIFY result into P0/P1/P2/P3.

---

# 12. Audit handoff

Files created/touched by Lane 1:
- `docs/TESWA_PRODUCT_REALITY_AUDIT_2026-09-03.md` only.

Implementation files touched:
- **None.**

Validation performed:
- Read company closure plan.
- Confirmed target branch.
- Static end-to-end route/code review across requested product surfaces.
- Re-checked older audit claims against current implementation.
- Verified that the old “nearby is only city/area matching” claim is superseded by current M48.1 radius code.
- Verified current Dolab bridge rather than repeating older placeholder findings.
- Distinguished confirmed static findings from runtime-only checks.

Remaining:
- Real-device/backend runtime verification.
- No merge to `main` from this lane without integration review.
