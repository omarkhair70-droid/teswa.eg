# Teswa Native Android — Current Checkpoint — 2026-09-17

> **Read this first.** Then read `TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-17.md` for the complete server/runtime/release state and `TESWA_NATIVE_ANDROID_MASTER.md` for architecture invariants. Always re-check PR #523 head before changing code.

## Repository

- Repo: `omarkhair70-droid/teswa.eg`
- Base: `chore/oracle-runtime-cutover-prep-20260910`
- Active branch: `feat/native-foundation-network-20260915`
- PR: #523 — open, mergeable, intentionally unmerged
- Do not merge without explicit approval.

## Native product

The planned Kotlin/Compose product scope is closed on Git side. Do not reopen Auth, Home, Add Item, Offers, Deals, Reviews, Direct/Contextual Messaging, Voice, Stories, Profiles, Settings, Notifications, Nearby, Discover, People, Motion, Dolab, Edit Listing, Reporting, Followers/Following, or navigation without a concrete device/production failure.

## Release identity

- `applicationId com.teswa.mobile`
- `versionCode 26`
- `versionName 1.0.11`
- Existing Play upload key verified against Google Play.
- Upload SHA-256: `9E:CE:E2:66:79:C8:7D:4F:6F:51:39:F1:96:7F:ED:20:01:06:C6:C0:FE:42:49:A8:31:8E:F8:84:90:FC:B7:F1`

## Oracle cutover runtime

Current intended native release ingress:

`https://core01.tail6afd9b.ts.net`

Server routing currently observed:

`Tailscale Funnel -> 127.0.0.1:4140 cutover gateway -> Auth 3110 / Domain 3130 / Realtime 3120`

Normal public DNS resolved again after the earlier transient NXDOMAIN incident. Public `/healthz` and `/v1/auth/healthz` both returned HTTP 200 on 2026-09-17. Re-check immediately before final AAB and use the hostname, never a transient Funnel edge IP.

Cutover DB authority for the systemd stack:

`teswa_cutover_20260913`

Do not blindly rerun the old Supabase final refresh and do not merge rehearsal/cutover databases.

## Push / FCM

Server-side preparation is now substantially closed:

- Core worker upgraded from old Expo-only to current Expo + FCM worker.
- Firebase project: `teswa-7d052`.
- External credential installed at `/etc/teswa/fcm-service-account.json` with `root:teswapush 0640`; secret contents are not in Git.
- Worker health: `providers=[expo,fcm]`, `fcmConfigured=true`, outbox ready, no Supabase runtime dependency.
- Google OAuth acquisition from Core: PASS.
- FCM HTTP v1 `validate_only=true`: HTTP 200 PASS with no delivery.
- Push outbox remained empty during validation.
- `teswa-push-shadow` remains intentionally inactive + disabled.

Do not start the cutover daemon while `TESWA_PUSH_SEND_ENABLED=0`; it would mark claimed jobs skipped. Activation must enable outbound delivery in the same controlled step.

Last device inventory before native install: 52 legacy Expo registrations / 50 active, zero native `fcm:` registrations. Real native registration and physical-device delivery/tap proof remain open.

## Auth blocker

Public Auth health is otherwise healthy, but still reports:

`confirmationDispatchConfigured:false`

Email confirmation delivery is a separate open release gate. Firebase push credentials do not solve it.

## Repo runbooks now available

- Full current handoff: `docs/TESWA_NATIVE_ANDROID_MASTER_HANDOFF_2026-09-17.md`
- Safe evidence collector: `scripts/oci-migration/cutover-runtime-evidence.sh`
- Guarded push status/preflight/activation operator: `scripts/oci-migration/push-cutover-activation-gate.sh`
- Reproducible cutover gateway wrapper: `scripts/oci-migration/runtime-source/api-shell/cutover_gateway.py`
- Reproducible systemd unit: `scripts/oci-migration/systemd/teswa-api-cutover.service`

The older `push-shadow-guest-deploy.sh` remains a **rehearsal** operator and must not be used as production activation.

## Remaining release gate

1. Fix/accept Auth email confirmation delivery.
2. Re-check and explicitly accept `https://core01.tail6afd9b.ts.net` as the release API endpoint.
3. Build signed v26 AAB with the already-verified Play upload key.
4. Play Internal update over the existing installed `com.teswa.mobile` without uninstall/data reset.
5. Observe native `fcm:` registration.
6. Run guarded push preflight, then activate outbound worker only when a real native device exists.
7. Verify foreground/background/killed-process notification delivery + tap routing.
8. Run the full physical-device critical-flow smoke.
9. Complete Oracle production end-to-end + rollback acceptance.
10. Only then intentionally merge #523 and later remove the legacy mobile runtime in a separate cleanup PR.

## Never do

- Never commit Firebase service-account JSON, JKS, passwords, private keys, OAuth tokens or full push tokens.
- Never hardcode Funnel edge IPs.
- Never declare production acceptance from CI alone.
- Never merge #523 without explicit approval.
