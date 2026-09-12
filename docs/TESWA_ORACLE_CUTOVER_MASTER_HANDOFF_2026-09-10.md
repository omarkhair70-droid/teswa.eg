# Teswa Oracle Cutover — Master Continuation Handoff

Updated: 2026-09-12

## Current source of truth

Repository: `omarkhair70-droid/teswa.eg`

Closure branch:

`chore/oracle-runtime-cutover-prep-20260910`

Current closure PR:

`#503 — Oracle runtime canonicalization and guarded sync closure`

The branch is based directly on `build/oracle-android-20260909`, so it already contains the Expo 57 picked-image persistence fix from PR #502. At the 2026-09-12 closure review it was ahead of that mobile branch and behind by zero commits.

Important closure commits:

- `5a1b83f369e960bd3cf04be58f9122aef0cbe99e` — canonical proven Oracle runtime source.
- `bbf693c0e8046bb4882e9c0c26bc992117cfa208` — guarded canonical runtime sync operator.

Earlier commits on the same continuation branch already contain the Oracle-specific discovery DB functions, verifier and guarded DB operator.

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

The previous persistence gap is now closed on the continuation branch.

Canonical source path:

`scripts/oci-migration/runtime-source/`

It now contains the Domain runtime, API shell, `requirements.txt` and runtime documentation.

Critical source provenance:

- `oracle_domain_read.py` uses the exact reviewed live blob `171f88a6a65b92be277bc8adaac214eb9ffd9898`.
- `server.py` contains the proven query-safe Offers dispatch behavior.
- `oracle_media.py` comes from the proven OCI media runtime capture.
- `requirements.txt` pins `oci==2.185.2`.
- API gateway canonicalization carries the proven Core ports, encoded-policy-key support, and Offers/Deals GET surface.

The API gateway keeps the previously reviewed implementation as `api-shell/shadow_gateway_base.py` and a small `api-shell/shadow_gateway.py` canonical entrypoint applies only the proven live routing deltas. The static `api-shell/healthz` is a compatibility marker; the gateway serves `/healthz` dynamically.

Generated Coolify files under `/data/coolify/...` remain non-canonical and must not become source of truth.

## Oracle discovery DB functions — CLOSED IN GITHUB

These functions are already proven live in `teswa_rehearsal` and now have Oracle-specific repository source/operator coverage:

1. `public.get_public_moving_items(integer)`
2. `public.get_public_city_pulse_moving_items(text[],integer)`
3. `public.get_nearby_marketplace_items(double precision,double precision,double precision,integer,integer)`

Oracle policy remains:

- `SECURITY DEFINER`
- `SET search_path=public`
- `REVOKE ALL ... FROM PUBLIC`
- `GRANT EXECUTE ... TO teswa_app_authenticated`

Do not create Supabase roles in Oracle merely to reuse historical Supabase migrations.

## Guarded runtime deployment path — CLOSED IN GITHUB, NOT EXECUTED LIVE

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

As of this handoff update, this operator has been committed but has **not** been executed against Core. Therefore the currently healthy Oracle processes have not been disturbed by the 2026-09-12 Git closure work.

## Mobile build state

Mobile base branch:

`build/oracle-android-20260909`

Known accepted fix commit:

`170f8ed85b120fdf7416ac0b1d856b352eea03fa`

This includes the Expo 57 picked-image persistence correction:

`await source.copy(destination)`

The Oracle preview APK used for the earlier live acceptance predates that fix. Do not build repeated APKs. The intended sequence remains exactly one final Android release candidate after the server/runtime closure is accepted.

## Supabase / cutover state

**Supabase is still the production authority.**

No 2026-09-12 repository closure action switched traffic or mutated Supabase.

Target architecture is not automatic Oracle -> Supabase fallback. Do not introduce dual-active fallback because it can create split-brain writes.

At explicit cutover:

- Oracle becomes the sole active backend authority for application traffic.
- Supabase may remain temporarily only as a cold/manual rollback source.
- Supabase can be retired after Oracle stability plus backup/restore acceptance.

## Remaining true gates

Repository canonicalization is no longer the blocker. The finite remaining sequence is:

1. Let PR #503 finish its repository/deployment checks and review any real failure.
2. Execute the guarded canonical runtime sync to Core.
3. Review the resulting live diff/receipt and perform a controlled Domain/API restart or recreate only when explicitly intended; then verify the public Oracle preview again. Do not restart Auth casually.
4. Build exactly one final Android APK/release candidate from the branch that contains the Expo 57 image-copy fix plus the accepted Oracle closure.
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

The repository-side closure is now:

**canonical Oracle runtime ✅ + durable Oracle DB functions ✅ + pinned OCI dependency ✅ + guarded runtime sync path ✅ + Expo 57 mobile fix already in branch ancestry ✅**

What remains is operational acceptance, one final APK/device smoke, and the explicit traffic-authority cutover.
