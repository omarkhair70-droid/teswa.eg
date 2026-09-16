# Teswa Native Android Master

This is the living engineering source of truth for the native Android replacement client. For the exact current server/runtime evidence and operator state, read `docs/TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-17.md` and `docs/TESWA_NATIVE_ANDROID_CURRENT_CHECKPOINT_2026-09-17.md` first.

## Identity and release invariants

- Repository: `omarkhair70-droid/teswa.eg`
- Canonical/base branch: `chore/oracle-runtime-cutover-prep-20260910`
- Active native branch: `feat/native-foundation-network-20260915`
- Active PR: #523 — intentionally open/unmerged until explicit acceptance
- Native project: `android-native/`
- Package/application ID: `com.teswa.mobile`
- Release: `versionCode 26`, `versionName 1.0.11`
- Toolchain: JDK 17, Gradle 9.6.0 in CI, Kotlin 2.3.21, Android Gradle Plugin 9.4.0
- Existing Google Play signing/upload identity must be preserved.
- Native runtime code must not depend on Expo, Expo Updates, React Native, or Supabase.
- Never merge #523 unless Omar explicitly asks.

Verified Google Play upload certificate SHA-256:

`9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1`

No JKS, password, Firebase private key, OAuth token, or production secret belongs in Git.

## Product / architecture rule

The migration is **not a port**.

- Expo = behavioral/product reference only.
- Oracle backend = durable data/business truth.
- Native Android = best new implementation of the user job.

Architecture:

`Repository/API/data -> StateHolder/ViewModel -> Compose UI`

Rules:

- no networking in Composables;
- one shared Oracle transport/authenticated executor;
- exactly one centralized session refresh + one retry after HTTP 401;
- feature-oriented packages;
- shared media/voice/network primitives;
- Android owns device/UX responsibilities, Oracle owns business/data authority;
- no provider-specific transport/storage logic scattered across screens.

## Current native packages

`AppContainer` is the composition root. Important packages include:

- `core/network/` — base URL, transport, errors, authenticated execution;
- `auth/` — Google Credential Manager, Oracle exchange, encrypted sessions, refresh/logout;
- `account/` — profile/policy gates;
- `home/` — feed, item detail, Nearby/location;
- `feature/additem/` — draft/media/publish;
- `feature/offers/` — offer creation/inbox/decisions;
- `feature/messages/`, `feature/direct/`, `feature/contextual/` — deal/direct/story-context conversations;
- `feature/voice/` — shared AAC capture/upload/playback;
- `feature/stories/` — rail/view/create/reply/manage;
- `feature/profile/` — own/public profile, social connections, media, trust, listing lifecycle;
- `feature/reviews/` — completed-deal reviews/trust signals;
- `feature/settings/` — privacy, notifications, blocks, signout/deletion;
- `feature/notifications/` — center, registration, display/tap routes;
- `feature/discover/`, `feature/people/`, `feature/motion/` — discovery world;
- `feature/dolab/` — private object workspace / marketplace bridge;
- `feature/safety/` — reporting;
- `shell/` — five-tab shell and validated native/custom/HTTPS routes;
- `ui/` — shared Teswa visual primitives.

## Native product scope — Git side closed

The planned product rewrite scope is implemented. Closed slices include:

- Auth/session/account gates
- Home + Item Detail
- Add Item
- Offers + Deals + Reviews
- Direct/Contextual Messaging + shared Voice
- Stories
- Profile/Public Profile + Follow/Block + Followers/Following
- Settings
- Notification Center + FCM foundation
- Nearby/location
- Discover 2.0 + People + Motion/City Pulse
- Dolab Native 2.0
- Edit Listing Native
- Trust & Safety / Reporting
- final Home/navigation/state cleanup

Do not reopen a product slice without a concrete device or production failure.

## Shared networking/session contract

All Oracle API traffic goes through the shared `OracleTransport` boundary. The default implementation owns:

- `BuildConfig.TESWA_API_BASE_URL`;
- connect/read timeouts;
- JSON request/response handling;
- `Accept`, `Content-Type`, `Authorization`, and native `User-Agent` headers;
- explicit offline/timeout/I/O/invalid-response outcomes.

Authenticated requests use `AuthenticatedOracleExecutor`:

1. use the supplied/stored session;
2. send the request;
3. on first HTTP 401, refresh once and persist rotated tokens;
4. retry the original request exactly once;
5. return the second response/session-expired result without looping.

Refresh is mutex-protected so concurrent features do not race multiple token rotations.

## Release endpoint boundary

Historical compile/test fallback:

`https://130-110-122-142.sslip.io`

That host is rehearsal history, not implicit production authority.

Current intended public cutover hostname:

`https://core01.tail6afd9b.ts.net`

Observed 2026-09-17 routing:

`Tailscale Funnel -> 127.0.0.1:4140 cutover gateway -> Auth 3110 / Domain 3130 / Realtime 3120`

Public `/healthz` and `/v1/auth/healthz` returned HTTP 200 after the earlier transient DNS incident. Re-check immediately before final release and then supply the explicitly accepted HTTPS URL as `TESWA_RELEASE_API_BASE_URL`.

Never hardcode observed Funnel edge IPs.

## Oracle database authority

Current clean cutover target:

`teswa_cutover_20260913`

Historical rehearsal DB:

`teswa_rehearsal`

The final DB closure already occurred around 2026-09-13 and later fixes explicitly refer to post-final-closure state. Do not blindly rerun the old final refresh and do not merge row differences between rehearsal/cutover without a new evidence-backed migration plan.

Systemd cutover services use the cutover DB. Older Docker/canary components can still use rehearsal and remain rollback/staging history until final acceptance.

## Push / FCM architecture and current server state

Business notification truth remains Oracle-owned. FCM/Expo are delivery couriers.

The current push worker supports both:

- legacy Expo push registrations;
- native Android `fcm:` registrations through FCM HTTP v1.

Firebase project:

- project ID `teswa-7d052`
- Android package `com.teswa.mobile`

Core external secret path:

`/etc/teswa/fcm-service-account.json`

The secret is not committed. Live observed permissions are `root:teswapush 0640`.

Server-side validation completed:

- upgraded worker health: providers Expo + FCM, `fcmConfigured=true`;
- Firebase OAuth acquisition: PASS;
- FCM HTTP v1 `validate_only=true`: HTTP 200 PASS;
- validation delivered no notification and did not touch the outbox.

The cutover push daemon is intentionally **inactive + disabled** until activation. Do not run it on the cutover DB with `TESWA_PUSH_SEND_ENABLED=0`, because claimed jobs would be marked skipped.

At the last device inventory there were 52 legacy Expo registrations / 50 active and zero native `fcm:` registrations. Physical-device registration/delivery/tap acceptance remains open.

Operator helpers:

- `scripts/oci-migration/cutover-runtime-evidence.sh`
- `scripts/oci-migration/push-cutover-activation-gate.sh`

The older `scripts/oci-migration/push-shadow-guest-deploy.sh` is rehearsal-only and must not be treated as production activation.

## Persistent cutover gateway source

The manually proven Core gateway is now codified in Git:

- `scripts/oci-migration/runtime-source/api-shell/cutover_gateway.py`
- `scripts/oci-migration/systemd/teswa-api-cutover.service`

It wraps the canonical `shadow_gateway.Server` and pins the systemd cutover upstream ports. The Funnel terminates TLS outside the Python gateway.

The gateway base health field `productionTraffic:false` is historical/hardcoded metadata, not a live route selector. Use routing + downstream health evidence to prove which stack is active.

## Auth release boundary

Current public Auth health is otherwise healthy but reports:

`confirmationDispatchConfigured:false`

Email confirmation delivery remains an explicit release blocker and is independent of Firebase push credentials.

## Add Item / media contract

Native Add Item reuses Oracle-owned media/publish contracts rather than legacy Supabase paths:

- category lookup;
- upload grant;
- fixed-length PUT;
- upload complete/verification;
- compensating object cleanup;
- exact marketplace publish contract;
- optional wanted tags/video;
- publish-failed compensation.

Native media flows stream bytes, expose progress/cancellation, preserve draft recovery, and avoid guessing deletion of unowned/external objects.

## Release acceptance checklist

- [x] Native project and Play package identity
- [x] Google Credential Manager -> Oracle auth exchange
- [x] Encrypted session persistence + centralized refresh/retry
- [x] Profile/policy account gates
- [x] Native shell/navigation/product routes
- [x] Home/Discover/Nearby/People/Motion
- [x] Add Item + media/publish orchestration
- [x] Offers/Deals/Reviews
- [x] Direct/Contextual Messaging + shared Voice
- [x] Stories
- [x] Own/Public Profile + media/social/trust
- [x] Settings/account controls
- [x] Dolab Native 2.0 + bridges
- [x] Edit Listing
- [x] Reporting + Followers/Following
- [x] Play upload-key certificate verified
- [x] Persistent cutover gateway installed/proven
- [x] Public Funnel DNS/health currently reachable
- [x] FCM service-account provisioned outside Git
- [x] FCM OAuth passed
- [x] FCM HTTP v1 validate-only passed
- [ ] Auth confirmation dispatch configured and accepted
- [ ] Final explicit production endpoint acceptance for `TESWA_RELEASE_API_BASE_URL`
- [ ] Signed v26 AAB through release gate
- [ ] Google Play Internal update over existing install
- [ ] Native `fcm:` registration observed on cutover DB
- [ ] Cutover push worker activated with outbound send enabled
- [ ] Foreground/background/killed-process push delivery + tap route verified
- [ ] Real-device critical-flow smoke
- [ ] Oracle production end-to-end acceptance + rollback evidence
- [ ] Intentional merge/cutover
- [ ] Separate legacy mobile cleanup PR

## Release helpers

Signed AAB:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\release-gate.ps1
```

Physical-device evidence after Play Internal install/update:

```powershell
powershell -ExecutionPolicy Bypass -File .\android-native\scripts\device-smoke.ps1
```

Server evidence:

```bash
bash scripts/oci-migration/cutover-runtime-evidence.sh
```

Push status/preflight:

```bash
bash scripts/oci-migration/push-cutover-activation-gate.sh status
bash scripts/oci-migration/push-cutover-activation-gate.sh preflight
```

The activation mode is deliberately guarded and should only be used after a real native FCM registration exists and the operator intentionally confirms the cutover DB.

## Acceptance boundaries

Green CI/compile does not prove:

- Google provider behavior on the release device;
- Play update-over-installed-app;
- physical camera/gallery/location/voice behavior;
- real background/killed push delivery;
- notification tap/deep-link behavior;
- production media/message writes;
- final Oracle rollback/cutover acceptance.

Do not declare those accepted until empirical evidence exists.

## Expo removal criteria

Legacy Expo/React Native/Supabase mobile runtime remains rollback history until all release acceptance gates pass. Remove/archive it only in a **separate final cleanup PR** after:

- signed v26 AAB;
- Play Internal update over the existing app;
- real-device critical flows;
- production Oracle acceptance;
- push/deep-link/background acceptance;
- rollback evidence.

Preserve git history. The target is controlled retirement, not pretending the legacy runtime never existed.
