# Teswa Oracle Cutover — Master Continuation Handoff

Updated: 2026-09-12

## Current source of truth

Repository: `omarkhair70-droid/teswa.eg`

Canonical Android/Oracle closure branch:

`build/oracle-android-20260909`

PR `#503 — Oracle runtime canonicalization and guarded sync closure` has now been merged into that branch.

Merge commit:

`ddd7488da71530fcb511e453ab04d1a84703b3d0`

Important closure commits include:

- `5a1b83f369e960bd3cf04be58f9122aef0cbe99e` — canonical proven Oracle runtime source.
- `bbf693c0e8046bb4882e9c0c26bc992117cfa208` — guarded canonical runtime sync operator.
- `cd12f971a373be00520bedc5525e982b792c8530` — GitHub Actions canonical runtime plan proof.

Earlier commits in the closure history contain the Oracle-specific discovery DB functions, verifier and guarded DB operator, plus the Expo SDK 57 hardening work.

## What is already proven live

The Oracle backend is not an untested future backend. It was exercised from the Teswa application on the Oracle preview and the failures encountered during that work were fixed on the live Oracle runtime before canonicalization.

Already accepted on the Oracle preview APK:

- Home ✅
- Messages ✅
- Account gate ✅
- Video teaser ✅
- City Pulse ✅
- Motion / animation ✅
- Nearby ✅
- Auth/session stable ✅

Repeated `/v1/auth/session` requests returned HTTP 200 after reopening the app.

Proven live runtime fixes include:

- Domain Auth resolver -> Auth on host port `4110`.
- `/v1/offers?...` dispatch uses the URL path, so query strings do not miss the Offers handler.
- API gateway policy keys accept encoded comma `%2C` as well as literal comma.
- API gateway allows the required authenticated Offers/Deals GET routes: incoming/sent offers, owned-active-items, offer/item detail, deals inbox/unread count/detail/confirmations/messages/reviews/message count.
- OCI media loads `/app/vendor`.
- OCI SDK proven at `oci==2.185.2`.
- Object Storage uses the explicit regional Oracle endpoint.
- Intended `item_video` signed-read behavior and `deal_voice` authorization are retained while upload/delete ownership checks remain separate.
- Temporary media trace instrumentation was removed after verification.

Do not re-diagnose these areas unless a new regression appears.

## Live Oracle topology

Core hostname: `core01`

Private OCI address: `10.20.10.176`

Public Oracle preview base:

`https://130-110-122-142.sslip.io`

Runtime topology:

- Auth -> host/socat `4110`
- Domain -> `127.0.0.1:4130`
- Realtime -> `127.0.0.1:4120`
- API -> `10.20.10.176:4100`
- Edge -> public HTTPS preview base

Host bind-mounted source:

- `/opt/teswa/domain-shadow -> /app`
- `/opt/teswa/api-shell -> /app`

Native PostgreSQL 17 on Core is intentional. Do not introduce a second PostgreSQL container.

## Proven live snapshot

Snapshot archive on Core:

`/home/opc/teswa-runtime-source-20260910.tar.gz`

SHA-256:

`2f1e75447b302b093a7050ca8c5aab9e31b3ac4db7e9919db79ea8c852af84d2`

Decoded size: 44,162 bytes.

The archive had 27 members including 23 Python files; all 23 Python files parsed successfully during the original review.

Excluded intentionally:

- `domain-shadow/vendor`
- backups
- `__pycache__`
- `*.pyc`
- environment files

The static review found no obvious embedded private-key block, JWT, OCI OCID or hard-coded password/secret/API-key assignment. Temporary `MEDIA_TRACE` code was absent.

## Canonical runtime — CLOSED IN GITHUB

Canonical source path:

`scripts/oci-migration/runtime-source/`

It contains the Domain runtime, API shell, `requirements.txt` and runtime documentation.

Critical source provenance:

- `oracle_domain_read.py` uses the exact reviewed live blob `171f88a6a65b92be277bc8adaac214eb9ffd9898`.
- `server.py` contains the proven query-safe Offers dispatch behavior.
- `oracle_media.py` comes from the proven OCI media runtime capture.
- `requirements.txt` pins `oci==2.185.2`.
- API gateway canonicalization carries the proven Core ports, encoded-policy-key support, and Offers/Deals GET surface.

The API gateway keeps the previously reviewed implementation as `api-shell/shadow_gateway_base.py` and a small `api-shell/shadow_gateway.py` canonical entrypoint applies only the proven live routing deltas. The static `api-shell/healthz` is a compatibility marker; the gateway serves `/healthz` dynamically.

Generated Coolify files under `/data/coolify/...` remain non-canonical and must not become source of truth.

## Oracle discovery DB functions — CLOSED IN GITHUB

These functions are already proven live in `teswa_rehearsal` and have Oracle-specific repository source/operator coverage:

1. `public.get_public_moving_items(integer)`
2. `public.get_public_city_pulse_moving_items(text[],integer)`
3. `public.get_nearby_marketplace_items(double precision,double precision,double precision,integer,integer)`

Oracle policy remains:

- `SECURITY DEFINER`
- `SET search_path=public`
- `REVOKE ALL ... FROM PUBLIC`
- `GRANT EXECUTE ... TO teswa_app_authenticated`

Do not create Supabase roles in Oracle merely to reuse historical Supabase migrations.

## Guarded runtime deployment path — PLAN GREEN, APPLY NOT YET EXECUTED

Operator:

`scripts/oci-migration/deploy-canonical-runtime-source.sh`

Safety properties:

- Defaults to `--plan`.
- `--apply` additionally requires `TESWA_ALLOW_ORACLE_RUNTIME_SYNC=YES`.
- Targets the expected `teswa-core-01` instance only.
- Uses the existing private/versioned `teswa-backups` Object Storage bucket and OCI Instance Agent instead of exposing SSH.
- Checks the canonical artifact SHA.
- Rejects source-side env/private-key/bytecode/backup/vendor artifacts.
- Verifies the proven OCI SDK version before changing source.
- Creates a host-local rollback copy before synchronization.
- Copies only repository-owned runtime source and preserves environment/vendor/unrelated host files.
- Compiles Python source after synchronization.
- Does **not** restart/recreate services automatically.
- Does **not** mutate Supabase.
- Does **not** perform a production traffic cutover.

A real GitHub Actions plan run completed successfully on 2026-09-12:

- workflow: `Oracle Runtime Sync Plan`
- run id: `34698136242`
- commit: `cd12f971a373be00520bedc5525e982b792c8530`
- target: `teswa-core-01`
- domain target: `/opt/teswa/domain-shadow`
- API target: `/opt/teswa/api-shell`
- artifact SHA-256: `1cc1d555afb21d76d4c005fef5a6b34200e5f767462f381c345b848d7c040312`
- `restart=never_automatic`
- `supabase_mutation=none`
- `production_cutover=none`
- `traffic_switch=none`
- `oracle_runtime_sync_plan=PASS`

The live `--apply` has still not been executed because the current chat runtime has GitHub/Supabase access but no Oracle Cloud/OCI execution connector. The historical OCI Run Command path itself is proven green and `ocarun` has the required passwordless sudo on Core; this is an access-channel limitation, not a repository/runtime blocker.

## SDK 57 mobile closure — GREEN

The merged Android branch now contains the picked-image persistence fix and the SDK 57 hardening completed during PR #503 review.

Verified fixes include:

- awaited durable `File.copy()` paths for picked/Dolab media;
- Expo SDK 57 patch-set alignment;
- Skia install-script allow-list alignment;
- production HIGH `@xmldom/xmldom` advisory removed without `--force` downgrade;
- Node `22.13.0` application/runtime baseline;
- current Node-24 GitHub action runtimes for final Android workflows.

Final PR validation passed:

- repository contracts ✅
- production High/Critical audit ✅
- Expo Doctor 21/21 ✅
- clean native Android prebuild ✅
- TypeScript ✅
- Android production export ✅

Do not build repeated APKs. The intended sequence remains exactly one final Android release candidate after the server/runtime operational closure is accepted.

## Supabase / current source drift — MEASURED 2026-09-12

Supabase remains the production authority.

The connected production source currently reports:

- Auth users: `34`
- Profiles: `34`
- Items: `39`
- Direct conversations: `22`
- Direct messages: `38`
- Storage objects: `157`
- latest Auth user creation: `2026-09-09 18:19:39 UTC`
- latest profile creation: `2026-09-09 18:19:39 UTC`
- latest direct conversation creation: `2026-09-08 20:23:47 UTC`
- latest direct message creation: `2026-09-09 06:04:01 UTC`
- latest Storage object creation: `2026-09-09 18:21:52 UTC`

This confirms the source has only a small amount of recent drift relative to the earlier Oracle rehearsal period.

Do **not** invent a per-table delta/CDC patch just for the few recent users/messages. The approved cutover strategy remains a **fresh full final refresh under a controlled write freeze**. The final transaction-consistent snapshot will therefore naturally include the recent users, their profiles, conversations/messages, and any new media while preserving UUID/FK consistency.

Production final-refresh rules remain:

1. controlled write freeze / maintenance boundary;
2. capture a final deep source cutover bundle;
3. use a fresh empty OCI cutover database rather than destructively clearing the working rehearsal DB;
4. restore the full final public-data snapshot;
5. preserve and verify identity UUID continuity;
6. perform final Storage drift sync and exact byte-hash parity;
7. verify deep source/target manifests and FK orphans;
8. run semantic smoke and production readiness gates;
9. only then switch production authority from Supabase to Oracle;
10. keep Supabase intact as cold/manual rollback during the acceptance window.

Target architecture is not automatic Oracle -> Supabase fallback. Do not introduce dual-active fallback because it can create split-brain writes.

## Remaining true gates

Repository and SDK 57 closure are no longer blockers. The finite remaining sequence is:

1. Execute guarded canonical runtime sync `--apply` to Core through an authenticated OCI CLI/Run Command channel.
2. Review the resulting live receipt/rollback path and perform a controlled Domain/API restart or recreate only when explicitly intended; verify the public Oracle preview again. Do not restart Auth casually.
3. Perform the fresh full final data refresh under write freeze into a fresh empty OCI cutover DB, including final Storage drift sync and identity/data parity gates.
4. Build exactly one final Android APK/release candidate from `build/oracle-android-20260909` after server/data acceptance.
5. Run one final device smoke against Oracle: session, Home, item/media flow, Nearby/Motion/City Pulse, Offers/Deals, Messages, and app reopen.
6. If email/password recovery is part of launch acceptance, prove real delivery/recovery. Google/session is already accepted and should not be reopened as a generic auth investigation.
7. Make the explicit production-authority cutover decision. Only that step changes Supabase from production authority to cold rollback.
8. After the chosen stability/backup-restore acceptance window, remove the Supabase dependency completely.

## Operational rules

- No public SSH exposure just for deployment.
- No second PostgreSQL container.
- No generated Coolify compose as canonical source.
- No reintroduction of diagnostic traces without a new regression.
- No casual Auth/API restart while healthy.
- No secrets, env values, private keys, tokens or credentials in Git.
- No automatic Supabase fallback.
- No Supabase production cutover without an explicit cutover decision.

## Finish line

Repository-side closure is now:

**canonical Oracle runtime ✅ + durable Oracle DB functions ✅ + pinned OCI dependency ✅ + guarded runtime sync plan PASS ✅ + Expo 57 mobile closure GREEN ✅ + current Supabase source drift measured ✅**

What remains is the authenticated OCI apply/restart, fresh final data refresh, one final APK/device smoke, and the explicit traffic-authority cutover.
