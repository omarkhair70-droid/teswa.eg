# Teswa Native Android — Master Continuation Handoff — 2026-09-17

> **READ THIS FIRST IN A NEW CHAT / CODEX SESSION.** This is the newest continuation snapshot for PR #523. It supersedes the 2026-09-16 handoff for current runtime/release state. Keep `docs/TESWA_NATIVE_ANDROID_MASTER.md` for architecture invariants and older handoffs for history. Always re-check PR #523 head before writing because the branch can move concurrently.

## 1. Repository / release invariants

- Repository: `omarkhair70-droid/teswa.eg`
- Base branch: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: **#523 — `Build Teswa native Android Oracle client`**
- PR state at this snapshot: open, mergeable, not merged.
- Head observed immediately before this handoff work: `2312bb3151b2fa16554a41dd8f5e76656294ffd1`.
- Native root: `android-native/`
- Package/application ID: `com.teswa.mobile`
- Release: `versionCode 26`, `versionName 1.0.11`
- **Do not merge PR #523 unless Omar explicitly asks.**
- Do not build a final AAB merely because Git-side code is green. Release acceptance remains empirical.

## 2. Product / architecture status

The planned Kotlin + Jetpack Compose rewrite scope is closed enough that new work should be release/runtime acceptance, not another broad product rewrite.

Already closed in PR #523: centralized Oracle auth/session/transport; Home; Item Detail; Add Item; Offers; Deals; Reviews; Direct + Contextual Messaging; shared Voice; Stories; Profile/Public Profile; Follow/Block; Followers/Following; Settings; Notifications/FCM foundation; Nearby; Discover 2.0; People; Motion/City Pulse; Dolab Native 2.0; Edit Listing; Trust & Safety/Reporting; and final navigation/state cleanup.

Do not reopen these without a concrete device or production failure.

Non-negotiable architecture:

- Expo is behavioral/product reference only.
- Oracle/Teswa backend owns durable data/business truth.
- Native Android owns UX/device integration.
- No networking in Composables.
- Shared Oracle authenticated transport/session refresh is authoritative.
- Exactly one refresh + one retry after HTTP 401.
- No Expo/React Native/Supabase runtime dependency inside `android-native`.
- Reuse shared media/voice/network primitives rather than duplicating stacks.

## 3. Play signing identity — CLOSED

The existing EAS production JKS for `com.teswa.mobile` was located locally in the legacy project and compared against Google Play Console Upload key certificate.

Verified upload-key SHA-256:

`9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1`

The certificate match is closed. Never generate a replacement upload key for this release path. Never commit the JKS or passwords.

## 4. Oracle Core topology — current observed state

Core instance:

- host label: `core01`
- Tailscale IPv4 observed: `100.78.2.83`
- private/core network address used by migration stack: `10.20.10.176`
- public Funnel hostname: `https://core01.tail6afd9b.ts.net`
- Core has no normal public VM IP; Tailscale/Funnel is the no-domain public ingress path.

Important runtime ports:

- `127.0.0.1:3110` — systemd Auth shadow, cutover database
- `127.0.0.1:3120` — systemd Realtime shadow, cutover database
- `127.0.0.1:3130` — systemd Domain shadow, cutover database
- `127.0.0.1:4140` — persistent cutover API gateway
- `10.20.10.176:4100` — older API canary / rehearsal-facing gateway
- `127.0.0.1:4110` — canary/Docker Auth
- `127.0.0.1:4120` — canary/Docker Realtime
- `127.0.0.1:4130` — canary/Docker Domain
- `127.0.0.1:4410` — older Funnel bridge path; retain until release acceptance, then remove deliberately.

The cutover gateway on the server is intentionally simple:

- source: `/opt/teswa/api-shell/cutover_gateway.py`
- service: `/etc/systemd/system/teswa-api-cutover.service`
- upstreams: Auth `3110`, Domain `3130`, Realtime `3120`
- local listener: `127.0.0.1:4140`

The server-side Funnel was moved to the cutover gateway:

`https://core01.tail6afd9b.ts.net -> http://127.0.0.1:4140`

Do not interpret the base `/healthz` field `productionTraffic:false` as a mutable cutover flag. The gateway health body contains historical/hardcoded metadata. Prove the active stack with routing configuration + explicit downstream health endpoints instead.

## 5. Public ingress / DNS — current evidence

There was a transient period where public DNS returned NXDOMAIN even though forced edge resolution reached the Funnel. That should be treated as historical; do not rebuild ingress solely because of that old incident.

Fresh Windows evidence on 2026-09-17 around 00:44 Cairo time:

- `Resolve-DnsName core01.tail6afd9b.ts.net` returned multiple public A and AAAA Funnel edge addresses.
- `curl.exe -i https://core01.tail6afd9b.ts.net/healthz` returned HTTP 200.
- `curl.exe -i https://core01.tail6afd9b.ts.net/v1/auth/healthz` returned HTTP 200.

Observed public gateway header/body included:

- `Server: TeswaPrivateGateway/1 Python/3.9.25`
- `/healthz`: status `ok`, service `teswa-api-shadow`, no Supabase runtime dependency.
- `/v1/auth/healthz`: status `ok`, durable sessions, password auth, signup bootstrap and refresh rotation active.

Do **not** hardcode any observed Funnel edge IP. The hostname is the contract; edge IPs can change.

Before building the release AAB, re-check normal DNS + both public health URLs once more and then use the accepted HTTPS hostname as `TESWA_RELEASE_API_BASE_URL`.

## 6. Cutover database state — do not blindly refresh again

Known PostgreSQL databases on Core:

- `teswa_cutover_20260913`
- `teswa_rehearsal`

Both were about 16 MB when inspected.

The final DB closure/refresh context already happened around 2026-09-13. Later fixes explicitly reference **post-final-DB-closure** behavior. Do not assume a final refresh was never executed and do not automatically run the old Supabase-to-Oracle refresh strategy again.

Observed schema counts:

- rehearsal: 46 tables, 112 functions, 98 policies, 41 RLS tables
- cutover: 46 tables, 112 functions, 97 policies, 41 RLS tables

The one observed policy difference was a redundant `profiles_self_select` SELECT policy present in rehearsal and absent in cutover; cutover still had the broader authenticated-visible profile SELECT policy plus self insert/update/push policies. Do not treat that one missing redundant policy as the release blocker.

Observed row drift existed in both directions because writes had hit both stacks at different times. **Never merge the databases blindly.** The clean target for the production runtime is `teswa_cutover_20260913` unless fresh evidence proves otherwise.

Systemd runtime components point at cutover. Older Docker/canary components still point at rehearsal. This split is intentional historical staging and must not be confused for current authority.

## 7. Auth runtime — current evidence

Public `/v1/auth/healthz` on the cutover route returned:

- `status: ok`
- `mode: teswa-auth-durable-shadow`
- `identityMappings: 34`
- `identityUsers: 34`
- `activeSessions: 3`
- `durableSessions: true`
- `passwordAuth: true`
- `signupBootstrap: true`
- `refreshRotation: true`
- `refreshTtlSeconds: 2592000`
- `accessTtlSeconds: 900`
- `supabaseRuntimeDependency: false`
- `confirmationDispatchConfigured: false`

The last field is important: **email confirmation delivery remains an open release blocker**. Do not conflate this with FCM; Firebase push credentials do not solve Auth email confirmation.

## 8. Push runtime — server-side preparation is now materially advanced

### 8.1 What was found

The deployed worker on Core was an older Expo-only generation. The `teswa-push-shadow` unit was:

- `inactive`
- `disabled`
- no journal entries
- database `teswa_cutover_20260913`
- `TESWA_PUSH_SEND_ENABLED=0`
- no FCM credential configured initially.

The old worker health was OK against the cutover DB, but it exposed no FCM provider symbols.

At that time:

- `public.push_devices`: 52 legacy Expo rows, 50 active
- no native `fcm:` registrations yet
- `teswa_jobs.push_outbox`: empty
- no push outbox errors.

### 8.2 Worker generation upgraded on Core

The current PR #523 worker source was downloaded from:

`scripts/oci-migration/push-shadow-worker.py`

at commit:

`2312bb3151b2fa16554a41dd8f5e76656294ffd1`

It was syntax-checked and installed at:

`/opt/teswa/push-shadow/worker.py`

The old deployed worker was backed up as:

`/opt/teswa/push-shadow/worker.py.pre-fcm-20260916`

The upgraded worker reports providers:

- `expo`
- `fcm`

The worker deliberately preserves legacy Expo delivery during the rollback window while routing native Android `fcm:` devices through FCM HTTP v1.

### 8.3 Firebase project / credential

Firebase Android project used by Native Teswa:

- Firebase project ID: `teswa-7d052`
- Firebase project number: `918426406146`
- Android package: `com.teswa.mobile`

A Firebase Admin service-account credential was generated manually from Firebase Console and installed **outside Git** at:

`/etc/teswa/fcm-service-account.json`

Observed metadata only:

- owner: `root`
- group: `teswapush`
- mode: `0640`
- size at installation: 2373 bytes

**Never commit, print, paste, or log the JSON contents/private key.** The file is intentionally external runtime state.

Systemd effective environment now includes:

- `TESWA_DB=teswa_cutover_20260913`
- `TESWA_PUSH_SEND_ENABLED=0`
- `TESWA_FCM_SERVICE_ACCOUNT_FILE=/etc/teswa/fcm-service-account.json`

Manual upgraded-worker health returned:

- `status: ok`
- `outboxReady: true`
- `sendEnabled: false`
- `providers: [expo, fcm]`
- `fcmConfigured: true`
- `supabaseRuntimeDependency: false`

### 8.4 Google OAuth / FCM control-plane validation — PASSED

Using the deployed worker code and the external service-account credential, the server successfully obtained an OAuth access token for Firebase Messaging.

Evidence:

- `FCM_OAUTH=PASS`
- `project_id=teswa-7d052`
- access token was received
- token itself was never printed/stored in the repository.

A separate FCM HTTP v1 `validate_only=true` request also passed:

- `FCM_VALIDATE_ONLY=PASS`
- HTTP 200
- `project_id=teswa-7d052`
- `delivery_performed=false`
- response name present
- push outbox remained empty
- push service remained inactive and disabled.

This proves the server credential + OAuth + FCM HTTP v1 request path works without delivering a notification.

### 8.5 Why the push daemon is intentionally still OFF

Current service state remains:

- `inactive`
- `disabled`

This is deliberate. When `TESWA_PUSH_SEND_ENABLED=0`, `process_one()` marks a claimed live job as `skipped` with `rehearsal_send_disabled`. Starting the daemon against the live cutover DB while sends are disabled could therefore consume future notification jobs without delivery.

Do **not** run the existing `push-shadow-guest-deploy.sh` as a production activation command. That script is a rehearsal operator: it targets `teswa_rehearsal`, keeps outbound disabled, and starts the service for synthetic rehearsal validation.

Do not start the cutover push daemon until the final activation step sets delivery enabled in the same controlled change.

## 9. Native FCM registration boundary

The Android native client currently registers a Firebase Installation ID using the existing API storage convention:

`fcm:<installation-id>`

and sends it to:

`POST /v1/notifications/push/register`

The server worker recognizes `fcm:` devices and emits an FCM HTTP v1 message addressed by FID. Server-side `validate_only=true` accepted that request shape.

However, there were still **zero native FCM device rows** when the DB was inspected. That is expected because the native v26 build has not yet been installed through the final device gate.

Therefore:

- server-side FCM control plane: **validated**
- real native registration: **not yet observed**
- real background/killed-process delivery: **not yet observed**
- real tap/deep-link route: **not yet observed**

Do not claim production push acceptance until those device facts exist.

## 10. Current release gates — exact remaining work

### Closed

- Native planned product scope: closed on Git side.
- Static compile/test/lint gate: green at the last verified implementation checkpoint.
- Existing Google Play upload-key identity: verified/closed.
- Public Funnel hostname currently resolves normally and public cutover health is reachable.
- Cutover API gateway route to Auth/Domain/Realtime is installed and persistent.
- FCM service-account provisioning on Core: done.
- FCM OAuth from Core: passed.
- FCM HTTP v1 validate-only probe: passed.

### Still open

1. **Auth email confirmation delivery** — `confirmationDispatchConfigured:false`.
2. Re-check public hostname/health immediately before release and explicitly accept it as `TESWA_RELEASE_API_BASE_URL`.
3. Build the signed native v26 AAB with the verified upload JKS.
4. Upload to Google Play Internal testing and update the existing Play-installed `com.teswa.mobile` without uninstall/data reset.
5. Observe actual native push registration in `public.push_devices`.
6. Activate the cutover push daemon with outbound delivery enabled in one controlled step; do not run it live with sends disabled.
7. Verify foreground/background/killed-process push delivery and notification tap/deep-link routing on the real device.
8. Run critical device flows: auth/session, Home/Discover/Add/Messages/Profile, camera/gallery/media, location/Nearby, voice, Stories, Dolab, Edit Listing, Reporting, Followers/Following.
9. Complete Oracle production end-to-end acceptance + rollback evidence.
10. Only after acceptance: intentional PR #523 merge/cutover, then a separate cleanup PR removing legacy Expo/React Native/Supabase mobile runtime.

## 11. What NOT to do next

- Do not re-run a blind final DB refresh from Supabase.
- Do not merge rehearsal and cutover databases.
- Do not run `push-shadow-guest-deploy.sh` as production activation.
- Do not start `teswa-push-shadow` while `TESWA_PUSH_SEND_ENABLED=0` on the cutover DB.
- Do not delete the older rehearsal/canary/bridge stack before native + Oracle acceptance.
- Do not hardcode current Tailscale Funnel edge IPs.
- Do not regenerate the Play upload key.
- Do not commit Firebase service-account JSON, JKS files, passwords, OAuth tokens, or private keys.
- Do not merge PR #523 without explicit approval.

## 12. Useful evidence commands on Core

These are safe/read-only or health-only. They do not print service-account contents.

```bash
# Cutover gateway / auth
curl -fsS http://127.0.0.1:4140/healthz
curl -fsS http://127.0.0.1:4140/v1/auth/healthz

# Public route
curl -fsS https://core01.tail6afd9b.ts.net/healthz
curl -fsS https://core01.tail6afd9b.ts.net/v1/auth/healthz

# Runtime units
systemctl is-active teswa-api-cutover teswa-auth-shadow teswa-domain-shadow teswa-realtime-shadow || true
systemctl is-active teswa-push-shadow || true
systemctl is-enabled teswa-push-shadow || true

# Funnel
sudo tailscale funnel status

# Push health without processing jobs
sudo -u teswapush env \
  TESWA_DB=teswa_cutover_20260913 \
  TESWA_PUSH_SEND_ENABLED=0 \
  TESWA_FCM_SERVICE_ACCOUNT_FILE=/etc/teswa/fcm-service-account.json \
  /usr/bin/python3 /opt/teswa/push-shadow/worker.py --health

# Credential metadata only
sudo stat -c '%n | owner=%U group=%G mode=%a size=%s' /etc/teswa/fcm-service-account.json

# Push device types without full tokens
sudo -u postgres psql -d teswa_cutover_20260913 -P pager=off -c "
SELECT CASE
  WHEN expo_push_token LIKE 'fcm:%' THEN 'native_fcm_fid'
  WHEN expo_push_token LIKE 'ExponentPushToken[%'
    OR expo_push_token LIKE 'ExpoPushToken[%' THEN 'legacy_expo'
  WHEN expo_push_token IS NULL OR btrim(expo_push_token)='' THEN 'empty'
  ELSE 'other'
END AS device_kind,
count(*) AS total,
count(*) FILTER (WHERE disabled_at IS NULL AND notifications_enabled=true) AS active
FROM public.push_devices
GROUP BY 1 ORDER BY 1;"

# Outbox status
sudo -u postgres psql -d teswa_cutover_20260913 -P pager=off -c "
SELECT status,count(*) FROM teswa_jobs.push_outbox GROUP BY status ORDER BY status;"
```

## 13. Windows / operator note

The Windows machine used during this session did not have the `tailscale` CLI installed, so direct SCP to the Core Tailscale IP timed out from Windows. This did **not** indicate a broken Core SSH daemon: `sshd` was active and listening on `0.0.0.0:22` / `[::]:22` on the server.

The Firebase service-account file was therefore transferred through the already-open secure Core terminal session and then installed with `root:teswapush 0640` permissions. Future operators can instead install Tailscale on Windows or use another already-authorized private transfer path.

Do not make public port 22 changes solely to simplify one credential transfer.

## 14. Continuation bootstrap prompt

```text
Continue Teswa Native Android from PR #523 on feat/native-foundation-network-20260915.

Read docs/TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-17.md first, then docs/TESWA_NATIVE_ANDROID_MASTER.md. Re-check the current PR head before any write. Do not merge #523 without explicit approval.

The Git-side native product scope is closed. Focus on release/runtime acceptance, not another architecture rewrite.

Oracle cutover runtime is on core01. Public Funnel is https://core01.tail6afd9b.ts.net and currently routes to the persistent 127.0.0.1:4140 cutover gateway, which fronts systemd Auth 3110, Realtime 3120 and Domain 3130 using teswa_cutover_20260913. Public /healthz and /v1/auth/healthz were HTTP 200 after the earlier transient DNS incident.

Push worker on Core has been upgraded from old Expo-only to the current Expo+FCM worker. Firebase service-account is external at /etc/teswa/fcm-service-account.json with root:teswapush 0640. Worker health shows providers expo+fcm and fcmConfigured=true. FCM OAuth passed and an HTTP v1 validate_only probe returned 200 without delivery. teswa-push-shadow is intentionally inactive+disabled because SEND_ENABLED=0 would skip claimed jobs. Do not start it in that state. At last DB check there were 52 legacy Expo devices / 50 active and zero native fcm: devices; outbox was empty.

Remaining release work: fix Auth confirmation delivery, re-check/accept the public release endpoint, build signed v26 AAB with the already-verified Play upload key, Play Internal update-over-installed-app, observe native FCM registration, activate push with send enabled, real background/killed notification + tap proof, full device smoke, Oracle end-to-end/rollback acceptance, then intentional merge and a separate legacy cleanup PR.

Never commit credentials/JKS/private keys and never blindly rerun the old final DB refresh.
```

## 15. Final principle

The next session should not rediscover the same infrastructure maze. Treat this file as the runtime/release source of truth, verify only facts that can change, and spend effort on the remaining empirical gates.