# Teswa Oracle migration — chat continuation checkpoint (2026-09-09)

This document is the durable handoff for continuing the owner conversation in a fresh ChatGPT/Codex chat. It records observed state and the next executable actions. Current code/tool evidence supersedes older handoffs when they conflict.

## Owner intent / non-negotiables

- Finish the existing Teswa migration to Oracle; do not rebuild the backend from scratch.
- Keep production on Supabase until explicit cutover approval.
- Do not delete/retire Supabase or mutate production source data as part of rehearsal.
- Avoid repeated expensive/slow Android builds just to discover configuration mistakes.
- Add Coolify as the normal deployment/operations control plane before production cutover, using the existing Nova Coolify installation where practical.
- Do not reinstall/rebuild the Edge or Core just to make management easier.
- Do not expose private keys/secrets in chat, repo, logs, or mobile env.
- Do not migrate away from Expo merely because one test build is slow. Treat an Expo migration as a separate product/engineering decision, not part of the Oracle backend migration.

## Repository / branch checkpoint

Repository: `omarkhair70-droid/teswa.eg`

Integration branch: `integration/oracle-domain-closure-20260907`

Observed integration HEAD at handoff creation: `58081628f8fd4b96996daebaeca0dae8f6e50e1c`

That commit is PR #499 merge: `fix(oci): avoid root-only backup writes during API smoke`.

Oracle Android test branch: `build/oracle-android-20260909`

Observed test-branch HEAD: `c6fbd2d97c7ef86bbb6ad2ad3429e0250b13be0d` (`fix(ci): enable native Google sign-in in Oracle test APK`).

Mission issue: #482 — complete Oracle migration and prove real app rehearsal.

## Public Oracle API — VERIFIED GREEN

A post-fix public API rehearsal completed successfully against the Teswa Edge:

- `state=SUCCEEDED`
- `exit_code=0`
- `session_http=401` (expected unauthenticated session behavior)
- `signup_http=503` (expected while transactional confirmation delivery is intentionally unavailable/not configured)
- `edge_public_api=PASS routes=/v1/* production_cutover=false`
- `public_api_verified=true`
- API URL used by the isolated test build: `https://130-110-122-142.sslip.io`

This closes the earlier Edge `/v1/*` 404 / smoke-script permission loop. Do not rerun the old failing smoke sequence unless a new regression is observed.

## Android Oracle test build — current facts

### Run 1

GitHub Actions run: `34370936503` (`Oracle Android Test APK`)

Result: SUCCESS. An isolated Oracle preview APK was produced and installed on the owner's phone.

Observed app behavior:

- App opens to the Teswa login screen.
- Google button displays, but Google sign-in fails immediately in the installed APK with the Arabic error meaning the Google sign-in flow could not be opened.
- Password login was also tried using the reviewer/testing account the owner remembers from Google Play review (`asrkhair9+teswareview@gmail.com`); login failed with the generic invalid-login UI. Do not assume this proves Oracle password auth is broken; the actual credential/account mapping for that address has not been verified.
- Owner also noticed the login UI feels visually too open/large in places. Treat this as a UI observation to review later, not an Oracle-infrastructure blocker.

### Why Google failed in Run 1

The isolated preview package is `com.teswa.mobile.preview`. In `app.config.js`, preview Google services are only included when `google-services.preview.json` exists. The Oracle auth adapter intentionally does **not** support browser OAuth ingress; it expects the native Google ID-token flow.

### Run 2

GitHub Actions run: `34377528274`.

Result: FAILURE **before Android build started**. The configuration guard failed because:

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` was empty / missing.

Therefore no second APK was built and no further build time should be spent until Google credentials/config are reconciled from the existing authorized configuration.

## Recommended Android testing strategy from this checkpoint

Do **not** immediately fire another hour-long build.

First do the fastest independent validation possible:

1. Verify/create one known Oracle rehearsal password account through the already deployed Oracle Auth path, without touching production or exposing a secret in chat.
2. Use the already-installed Run-1 APK to test password login if the APK embeds the Oracle provider correctly; if a credential/account mismatch is the only problem, this avoids another build.
3. Separately reconcile Google configuration by discovering/reusing the existing authorized Google OAuth/Firebase configuration. Do not invent a new provider or migrate away from Expo to solve this.
4. Only build again once a pre-build check proves the required Google web client ID and Android package/signing configuration are actually present.

The Oracle adapter routes password login to `/v1/auth/password` and native Google login to `/v1/auth/google` with an ID token. Browser OAuth fallback is intentionally unsupported for Oracle.

## Expo decision

No Expo migration has been approved or shown necessary. Keep Expo/EAS for the Android client for now. The current problem is test-build auth configuration, not evidence that Expo itself is the wrong architecture.

A later migration away from Expo would be a separate scope with its own cost/risk analysis after Oracle production migration is stable.

## Coolify / Tailscale — current standing point

Goal: reuse the existing Nova Coolify dashboard as the deployment/operations control plane for Teswa Core so normal backend updates become GitHub -> Coolify deploy -> health/logs/rollback, instead of repeated Cloud Shell work.

### Nova / Coolify host

- Existing Coolify is running on the Nova host.
- Tailscale was installed on `nova-backend` successfully.
- Nova joined the owner's Tailscale network successfully.
- Observed Nova Tailscale IPv4: `100.104.186.11`.
- Direct Nova -> Teswa Core private VCN connection to `10.20.10.176:22` timed out, which is why Tailscale was introduced as the private management path.

### Teswa Core

- `teswa-core-01` private IP: `10.20.10.176`.
- Oracle Linux Core Tailscale install command succeeded.
- Tailscale version observed: `1.102.3`.
- At last command output, Core authentication was still pending (`login_pending=true`) and no Core Tailscale IP had been assigned yet.

Next Coolify action after Core Tailscale auth:

1. Authenticate Core to the **same** Tailscale network as Nova.
2. Get Core `tailscale ip -4`.
3. From `nova-backend`, prove TCP/SSH reachability to `CORE_TAILSCALE_IP:22`.
4. Determine the actual SSH user/key to use; do not assume the Coolify form's default `root` or `localhost's key` is correct.
5. Add the Core as an existing remote server in Coolify using its Tailscale IP.
6. Before pressing any Coolify action that installs/restarts Docker/proxy, inventory current Core runtime/ports/services and preserve existing PostgreSQL/systemd/Podman behavior.
7. Do not replace Edge Caddy or expose private PostgreSQL.

## Edge/Core architecture that should be preserved

- Edge: `teswa-edge-01`, public HTTPS/Caddy ingress.
- Core: `teswa-core-01`, private application/data services.
- PostgreSQL remains private; no public 5432.
- Tailscale is an **administration path**, not the public application data path.
- Coolify is the desired deployment/operations layer, not a reason to rebuild the working backend.

## The earlier ~25-minute task — what it actually did

The recovered prior task state shows it:

- fetched/advanced the Oracle integration work to a checkpoint whose commit was `ffff507` (`Wire the complete Oracle backend provider` at that time), adding Oracle adapters/runtime SQL/tests/workflows;
- attempted the Lane 4 read-only rehearsal;
- did **not** finish that rehearsal because repeated `psql` attempts could not find a local PostgreSQL socket, even after a manifest/Podman wrapper attempt.

That was an earlier checkpoint, not the current final state. Subsequent work advanced beyond it: the current integration branch is now at `58081628...`, and public Edge API rehearsal is now green. Do not repeat the old 25-minute task from scratch.

## Next chat — start here

The fresh chat should read this file, then continue **without re-auditing the whole project**.

Recommended next execution order:

1. Finish Core Tailscale authentication and prove Nova -> Core SSH reachability.
2. Connect Core to existing Coolify safely after runtime inventory.
3. In parallel, establish one known Oracle rehearsal password account and test login using the already-installed APK, avoiding another build.
4. Reconcile Google native sign-in configuration from existing authorized Google/Firebase settings; add a pre-build guard and only then spend another Android build.
5. Continue real Oracle app E2E: Auth -> Home/Discover -> item detail/publish/media -> offer -> deal text/voice -> notifications/profile/settings/etc.
6. Only after app/service acceptance: fresh final Supabase delta/parity, backup/rollback, production cutover approval.

## Definition of done remains

Complete Oracle-backed Teswa behavior proven on the real app, stable managed deployment path through Coolify, service dependencies verified, final fresh parity/rollback package ready, then explicit production cutover approval. Production retirement of Supabase is a separate final gate.
