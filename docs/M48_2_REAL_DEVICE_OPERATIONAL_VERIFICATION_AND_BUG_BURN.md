# M48.2 — Real-Device Operational Verification & Bug Burn

## 1) Executive verdict

After M48.1, Teswa is **code-complete** for the currently approved pre-launch roadmap (M44 → M48.1), but it is **not yet fully operationally verified end-to-end on real phones**.

This M48.2 phase contributes:
- A practical, execution-ready real-device QA checklist.
- Exact infra/deploy prerequisites that must be true before final verification.
- Exact high-risk code-side checks against follow graph, sharing, and true nearby radius.
- Provable launch-relevant bug fixes included in this PR (documented below).

---

## 2) Operational state summary

| Surface | Status | Repo evidence | Operational note |
|---|---|---|---|
| Database migrations | **Applied — reported complete by project owner through M48.1.** | M47.5 + M48.1 migration files exist in `supabase/migrations/` | Treat as owner-confirmed complete unless new migrations are added in future PRs. |
| Edge Function: `delete-account` | Code present | `supabase/functions/delete-account/index.ts` | Live deployment is not provable from repo; requires manual Supabase deployment verification. |
| Edge Function: `send-notification-push` | Code present | `supabase/functions/send-notification-push/index.ts` | Live deployment/webhook wiring cannot be proven from repo alone; requires manual verification. |
| Edge Function: `run-smart-reengagement-notifications` | Code present | `supabase/functions/run-smart-reengagement-notifications/index.ts` | Operational scheduler/manual invocation must be verified in project environment. |

---

## 3) Required runtime config / secrets

### Mobile runtime env
- `EXPO_PUBLIC_SUPABASE_URL` — required client runtime URL.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — required client key.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — required if Google sign-in is enabled in your auth path.
- `EXPO_PUBLIC_SHARE_BASE_URL` — required for **public clickable HTTPS** item links (`https://.../item/:id`).
  - Must be an HTTPS base URL.
  - If unset/invalid, app uses deep-link-oriented fallback text and does **not** promise public web clickability.

### Edge Function / backend secrets
- `SUPABASE_URL` — function runtime access.
- `SUPABASE_SERVICE_ROLE_KEY` — required by functions doing privileged reads/writes.
- `SUPABASE_ANON_KEY` — used by some function flows when required.
- `EXPO_ACCESS_TOKEN` — used by push fanout function for Expo push API.
- `TESWA_SMART_NOTIFICATION_JOB_SECRET` — required to authorize `run-smart-reengagement-notifications` job execution.

> Repo code confirms secret dependencies, but cannot prove they are configured in the live Supabase project.

---

## 4) Real-device QA accounts plan

Use at least two real devices (or one device + one second physical device) and these accounts:

- **User A (primary tester):** full active account with profile + listings + media.
- **User B (counterparty):** second active account to validate cross-user interactions.
- **User C (optional):** third account for blocked/triangulation scenarios and notification routing sanity.

### Why this structure
- Follow / follow-back / mutual state requires at least A ↔ B.
- Offer/deal messaging and voice exchange requires two distinct users.
- Block/report behavior is clearer with a third actor when testing isolation.
- Push and reminder verification requires sender/recipient separation.
- Nearby discovery requires at least one coordinate-bearing listing by another account.
- Account deletion destructive E2E must use **disposable account only**.

---

## 5) Full manual QA matrix

Use this format during execution: **Pass/Fail** + screenshot/log link in Notes.

| Area | Scenario | Exact action | Expected result | Pass/Fail | Notes/Evidence |
|---|---|---|---|---|---|
| B1 App identity/entry | Icon + splash | Install preview/production-like build and launch cold | Correct icon + splash identity | ☐ | |
| B1 | Cold start | Kill app; reopen | App reaches usable screen without root stall | ☐ | |
| B1 | Warm reopen | Background then foreground | State restores quickly without forced restart | ☐ | |
| B1 | OTA behavior (preview) | Publish OTA, reopen app | Compatible JS updates apply; no broken boot | ☐ | |
| B1 | Retry UI correctness | Induce network failure then recover | Retry appears only on failure and clears after success | ☐ | |
| B2 Auth/onboarding | New signup | Create fresh account | Profile creation + policy gate enforced | ☐ | |
| B2 | Existing login | Login with existing account | Session resumes properly | ☐ | |
| B2 | Google sign-in (if enabled) | Sign in via Google | Successful auth + account linkage | ☐ | |
| B2 | Public legal routes | Open legal routes while logged out | Publicly accessible | ☐ | |
| B2 | Public account deletion page | Open account deletion web route logged out | Route loads publicly | ☐ | |
| B2 | Logout/login continuity | Logout then login again | No force-close required for state continuity | ☐ | |
| B3 Follow graph | Open own/public profile | Open A profile and B profile | Correct data + actions rendered | ☐ | |
| B3 | Follow/unfollow/follow-back | A follows B, B follows back, then unfollow path | Counters + button state + mutual label consistent | ☐ | |
| B3 | Followers/following lists | Open lists and row actions | Row follow actions update truthfully; row tap opens correct profile | ☐ | |
| B3 | Follow notification route | Trigger follow notification and tap | Routes to follower profile | ☐ | |
| B3 | Block-follows interaction | Block between A/B then re-open profile/list | Follow edge removed/prevented where implemented | ☐ | |
| B4 Add item/drafts | Add with photos | Create listing with required images | Publish succeeds | ☐ | |
| B4 | Optional video teaser | Attach teaser when available | Teaser stored/rendered in detail | ☐ | |
| B4 | Fill city from location | Use autofill location button | City/area populate | ☐ | |
| B4 | Manual edit clears precision mode | Autofill then manually edit city/area | Precise coordinates cleared by behavior | ☐ | |
| B4 | Draft save/resume | Save draft then resume/edit | Draft remains coherent | ☐ | |
| B4 | Nearby inclusion logic | Publish coordinate-bearing and coordinate-less items | Only coordinate-bearing appears in strict nearby | ☐ | |
| B5 True nearby | Tap “اعرض الأقرب لي” | Grant permission and load | Nearby state active with “داخل 3 كم تقريبًا” | ☐ | |
| B5 | Nearby empty truth | Test area with/without strict-radius items | Empty state shown only when truly empty in radius | ☐ | |
| B5 | Filter coexistence | Apply search/category/condition in nearby mode | No misleading nearby-empty copy | ☐ | |
| B5 | Clear nearby | Clear nearby filter | Returns to normal browse mode | ☐ | |
| B5 | Nearby pagination | Scroll/load-more in nearby mode | Pagination works, no stuck loader | ☐ | |
| B5 | Permission denied/unavailable | Deny permission or simulate unavailable | Truthful recoverable fallback/error | ☐ | |
| B6 Item detail/share | Detail media | Open item from card | Detail + images/video behavior works | ☐ | |
| B6 | Report entry | Open item report path | Report action exists and opens | ☐ | |
| B6 | Share with `EXPO_PUBLIC_SHARE_BASE_URL` | Share item into external app | HTTPS link is clickable public URL | ☐ | |
| B6 | Share without base URL | Unset base URL then share | Fallback copy is truthful (no fake web promise) | ☐ | |
| B7 Stories/contextual | Story create/view | Create story and open viewer | Acceptable first-frame + no dead-end load | ☐ | |
| B7 | Story replies | Send text + voice reply | Thread updates and media playable | ☐ | |
| B7 | Permission denied path | Deny mic during voice action | UI resets truthfully/recoverably | ☐ | |
| B7 | Contextual thread | Open from story and exchange messages | Text + voice send/receive/playback works | ☐ | |
| B8 Motion/media | Motion landing + viewer | Open/close viewer repeatedly | Playback starts, no stuck loading states | ☐ | |
| B8 | Motion share | Use implemented motion share path | Share action remains functional | ☐ | |
| B9 Offers/deals | Offer lifecycle | A sends, B accepts/rejects/thinking | Correct lifecycle state transitions | ☐ | |
| B9 | Deal chat + voice | Exchange text + voice in deal chat | Delivery/read/playback works across users | ☐ | |
| B9 | Completion/review | Complete deal then submit review flow | Completion confirmation + review path works | ☐ | |
| B9 | Block restrictions | Blocked user attempts interaction | Enforced restrictions still hold | ☐ | |
| B10 Notifications | Transactional + follow pushes | Trigger events between A/B | Receipt + center listing + route targets accurate | ☐ | |
| B10 | Tap routing coverage | Tap push for item/deal/contextual/profile | Opens expected route target | ☐ | |
| B10 | Smart reminder run | Invoke `run-smart-reengagement-notifications` (manual/scheduled) | Eligible rows inserted; dedupe/caps observed where practical | ☐ | |
| B11 Safety/compliance | Report user/item/story | Submit each report type | Report path works without crash | ☐ | |
| B11 | Account deletion destructive | Use disposable account deletion flow | Account removed, signed out, no lingering access | ☐ | |
| B11 | Public legal/deletion visibility | Logged-out open legal + deletion routes | Public visibility maintained | ☐ | |
| B11 | Policy gate integrity | Fresh account onboarding | Policy acceptance cannot be bypassed | ☐ | |
| B12 Runtime feel | Tap/voice/media/perf heuristics | Observe each critical interaction under good/weak network | No dead-air confusion; retries understandable; UX feels responsive | ☐ | |

### B12 focused runtime-feel observation checklist
- Perceived tap responsiveness (all main actions).
- Voice record start delay.
- Voice send acknowledgment clarity.
- Voice playback response on first tap.
- Story viewer opening feel.
- Motion/reel opening feel.
- Image/video loading pacing.
- Nearby location wait messaging clarity.
- Upload/send wording clarity during wait.
- Retry/recoverability under weak network.
- Any “dead air” periods that feel broken despite eventual success.

---

## 6) Code-side bug burn executed in this PR

### Fixed (provable) launch-relevant issues
1. **Route param hardening for profile/follow list screens**
   - `useLocalSearchParams` can return `string[]`; some screens assumed plain `string`.
   - Added normalization helper to avoid invalid RPC/profile fetch payloads from array params.
   - Affected flows: public profile, followers list, following list.

2. **Share base URL strictness for public clickability truth**
   - Public share base now accepts only `https://...` (not generic `http://`).
   - Prevents non-secure base from being treated as valid public share URL.

### Focus areas audited (no speculative refactor)
- M47.5 follow graph route/state/list logic.
- M48 share base/fallback behavior.
- M48.1 nearby filter flow, pagination handoff, and error-state behavior.

---

## 7) Before the final device run

1. **Database status**
   - Migrations are **reported applied by project owner through M48.1**.

2. **Edge Function deployment verification (manual required)**
   - Confirm these are deployed and reachable in target Supabase project:
     - `delete-account`
     - `send-notification-push`
     - `run-smart-reengagement-notifications`
   - Repo code alone cannot prove live deployment status.

3. **Runtime env/secrets confirmation**
   - Confirm mobile env vars (`EXPO_PUBLIC_*`) and backend secrets are present.
   - Confirm `EXPO_PUBLIC_SHARE_BASE_URL` and `TESWA_SMART_NOTIFICATION_JOB_SECRET` specifically.

4. **Build/update context**
   - Final QA must run on a build that includes all merged code.
   - If OTA preview channel is used, native-incompatible changes still require a rebuilt binary.


### Current preview OTA is stale — required refresh before QA

- Last known published Android preview OTA command (owner-confirmed):
  - `npx.cmd eas-cli@latest update --channel preview --platform android --message "M44 compliance pack operational verification"`
- No newer OTA has been published since that M44 update.
- Therefore, the currently installed Android preview bundle should be treated as stale versus all later merged phases (including M44E, M46A, M46B, M47.5, M48, M48.1, and M48.2 once merged).
- **Do not start final real-device QA until a fresh Android preview OTA built from the latest merged `main` is published and loaded on-device.**

Recommended local sync + preview bundle sequence:

1. `git checkout main`
2. `git pull origin main`
3. `npm.cmd run typecheck`
4. `npx.cmd eas-cli@latest update --channel preview --platform android --message "M48.2 pre-launch real-device verification bundle"`

Operational note for step 3:
- If `npm.cmd run typecheck` fails with the already-known baseline Expo/TypeScript environment issues, record that output and continue with OTA decisioning; do **not** misclassify it as a newly introduced M48.2 regression.

Before running the manual QA matrix:
- Open the installed Android preview app and confirm the latest preview update is actually applied on the device.


5. **What static code review cannot verify**
   - Actual push delivery and vendor transport behavior.
   - Real push tap routing on physical device shells.
   - Microphone timing/latency feel.
   - Story/motion playback smoothness on real hardware.
   - Share-link clickability behavior across third-party recipient apps.
   - True GPS nearby behavior in owner’s real physical environment.
