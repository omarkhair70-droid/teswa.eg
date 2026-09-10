# Teswa Oracle Cutover — Master Continuation Handoff

Date: 2026-09-10

## Purpose

This file is the continuation source of truth for the current Teswa Oracle migration/cutover work. A new chat should read this file first, then inspect the referenced branches/files before making any live change.

## Repository / working branches

Repository: `omarkhair70-droid/teswa.eg`

### Mobile branch

`build/oracle-android-20260909`

Known head from this work: `170f8ed85b120fdf7416ac0b1d856b352eea03fa`

This branch contains the final mobile-side picked-image persistence fix merged from PR #502:

- Expo SDK 57 file copy changed from `source.copy(destination)` to `await source.copy(destination)`.
- The currently installed Oracle preview APK predates this fix, so one final APK still needs to be built after server persistence/canonicalization is closed.

### Canonical runtime capture branch

`chore/oracle-live-runtime-canonical-20260910`

This branch was used to begin capturing the proven live Oracle runtime. It is **not** based on the current mobile branch and currently diverges from it; do not merge it blindly.

Files already captured there include:

- `scripts/oci-migration/runtime-source/README.md`
- `scripts/oci-migration/runtime-source/domain-shadow/server.py`
- `scripts/oci-migration/runtime-source/domain-shadow/oracle_media.py`
- `scripts/oci-migration/runtime-source/domain-shadow/requirements.txt`

`requirements.txt` pins the proven live OCI SDK version:

`oci==2.185.2`

### Final continuation branch

`chore/oracle-runtime-cutover-prep-20260910`

This branch was created from `build/oracle-android-20260909` and is the recommended branch for the next chat to continue on. It starts from the branch that already contains the mobile image persistence fix. Port/copy the intended canonical runtime changes onto this branch instead of merging the divergent canonical branch wholesale.

## Live infrastructure state

### Core

Hostname: `core01`

Private OCI address: `10.20.10.176`

The instance metadata reported **no public IP**.

An overlay/private address `100.78.2.83` also exists, but the user's laptop could not reach port 22 on it.

Do not expose Core SSH publicly just to move files.

### Edge / public API

Current Oracle preview API/Auth public base:

`https://130-110-122-142.sslip.io`

### Runtime topology

- Auth internal service -> host/socat `4110`
- Domain -> `127.0.0.1:4130`
- Realtime -> `127.0.0.1:4120`
- API -> `10.20.10.176:4100`
- Edge -> public HTTPS endpoint above

Current Domain and API use host bind-mounted source directories:

- `/opt/teswa/domain-shadow -> /app`
- `/opt/teswa/api-shell -> /app`

Therefore the current hotfixes survive ordinary container restart/recreate as long as those host directories remain intact. The risk is host rebuild or any future script/operator that overwrites those directories.

A server search did not find another updater/bootstrap script for these directories in `/opt/teswa`, `/home/opc`, or `/data/coolify` apart from the runtime files/history. Generated Coolify compose files must not be treated as canonical source.

## Live runtime snapshot

Snapshot archive on Core:

`/home/opc/teswa-runtime-source-20260910.tar.gz`

Archive SHA-256:

`2f1e75447b302b093a7050ca8c5aab9e31b3ac4db7e9919db79ea8c852af84d2`

Decoded archive size: `44,162 bytes`

Tar members: `27`

Python source files: `23`

All 23 Python files parsed successfully during review.

The archive intentionally excluded:

- `domain-shadow/vendor`
- `*.bak-*`
- `__pycache__`
- `*.pyc`
- environment files

A static review found no obvious embedded private-key block, JWT, OCI OCID, or hard-coded password/secret/API-key assignment. Temporary `MEDIA_TRACE` markers are not present in the captured runtime.

The full snapshot contains these live source files:

### domain-shadow

- `oracle_marketplace_edit.py`
- `oracle_marketplace_image_plan.py`
- `oracle_domain_read.py`
- `oracle_marketplace_write.py`
- `oracle_marketplace_lifecycle.py`
- `oracle_exchange.py`
- `oracle_exchange_read.py`
- `oracle_exchange_read_extra.py`
- `oracle_media.py`
- `oracle_profiles.py`
- `oracle_notifications.py`
- `oracle_reviews.py`
- `oracle_direct_messaging.py`
- `oracle_contextual_messaging.py`
- `oracle_stories.py`
- `oracle_discovery.py`
- `oracle_dolab.py`
- `oracle_policies_analytics.py`
- `oracle_moderation.py`
- `oracle_account.py`
- `diagnose_oracle_profile.py`
- `server.py`

### api-shell

- `healthz`
- `shadow_gateway.py`

## Mobile runtime acceptance already verified on the current Oracle preview APK

Do not re-diagnose these unless a new failure is reported:

- Home ✅
- Messages ✅
- Account gate ✅
- Video teaser ✅
- City Pulse ✅
- Motion / animation ✅
- Nearby ✅
- Auth/session currently stable ✅

Repeated `/v1/auth/session` requests were returning 200 after reopening the app.

## Proven live runtime fixes

### Auth resolver

Domain AuthResolver live default was corrected to host Auth port `4110`.

### Offers dispatcher

Domain dispatcher was corrected so `/v1/offers?...` is matched by URL path rather than missing because of the query string.

Equivalent behavior:

`urlsplit(self.path).path == '/v1/offers'`

### API gateway policies

The policies key matcher was fixed to accept encoded commas `%2C` in addition to literal commas.

### Exchange GET gateway allow-list

Required Offers/Deals GET routes were added to the gateway allow-list, including incoming/sent offers, owned-active-items, offer detail/item detail, deals inbox/unread count/detail/confirmations/messages/reviews/message count.

### OCI media

Live `oracle_media.py` includes:

- `/app/vendor` in `sys.path`
- OCI SDK dependency proven with `oci==2.185.2`
- explicit Object Storage endpoint:
  `https://objectstorage.{region}.oraclecloud.com`
- signed-url read allowance for `item_video`
- `deal_voice` authorization retained
- upload/delete ownership checks remain separate and enforced

The temporary trace code was removed after verification.

## Oracle database functions added live and already proven by the app

These functions exist in `teswa_rehearsal` live now but still need Oracle-specific canonical migration/operator source in GitHub:

1. `public.get_public_moving_items(integer)`
2. `public.get_public_city_pulse_moving_items(text[],integer)`
3. `public.get_nearby_marketplace_items(double precision,double precision,double precision,integer,integer)`

For Oracle, use:

- `SECURITY DEFINER`
- `SET search_path=public`
- `REVOKE ALL ... FROM PUBLIC`
- `GRANT EXECUTE ... TO teswa_app_authenticated`

Do **not** create Supabase roles (`anon`, `authenticated`, `service_role`) in Oracle merely to reuse old Supabase migrations.

The original Supabase migrations can be used as logic references only:

- `supabase/migrations/20260518083000_public_motion_interest_and_offers_privacy.sql`
- `supabase/migrations/20260518170000_add_public_city_pulse_moving_items.sql`
- `supabase/migrations/20260520170000_m48_1_true_nearby_radius_discovery.sql`

## Important runtime persistence issue still open

The live runtime works, but most of the captured 23 Python files are not yet committed as a complete canonical runtime tree on the final continuation branch.

The next chat should:

1. Continue on `chore/oracle-runtime-cutover-prep-20260910`.
2. Bring the proven runtime source under a stable repository path such as `scripts/oci-migration/runtime-source/`.
3. Preserve the proven live behavior while cleaning any rehearsal-only defaults.
4. Add a guarded deployment/operator mechanism that installs/syncs this repository runtime to `/opt/teswa/domain-shadow` and `/opt/teswa/api-shell`.
5. Never make generated Coolify `/data/coolify/.../docker-compose.yml` the source of truth.

## Port/default cleanup note

The live service is healthy because Coolify explicitly starts Domain/API with the correct ports, but captured source still contains some old rehearsal defaults.

Example: `domain-shadow/server.py` still defaults CLI `--port` to `3130`, while the actual live Domain service is started explicitly on `4130`.

Treat this as a cleanup/footgun issue, not a current live outage. Do not restart healthy services merely to test default-port cleanup.

## Supabase state / cutover policy

Supabase remains the production authority until the explicit final cutover decision.

The target architecture is **not** automatic fallback from Oracle to Supabase. Automatic dual-backend fallback risks split-brain data and must not be introduced.

At cutover:

- Oracle becomes the sole active backend authority for app traffic.
- Supabase may remain temporarily only as a cold/manual rollback source.
- After Oracle backup/restore and stability acceptance are proven, Supabase can be retired completely.

Recent Supabase usage observed from the dashboard was small relative to the Free plan quota:

- Database: ~42 MB / 500 MB
- File Storage: ~0.13 GB / 1 GB
- Egress: ~0.20 GB / 5 GB
- MAU: 5 / 50,000

So the current Teswa load is very small compared with available capacity. The reason to retain Supabase temporarily is rollback safety, not resource need.

## Remaining blockers before final Oracle cutover

The main remaining work is closure/persistence, not rebuilding the backend:

1. Canonicalize the full proven live runtime source on the continuation branch.
2. Canonicalize the three live Oracle DB functions with Oracle role grants.
3. Make OCI SDK installation/deployment durable rather than relying on the live `/app/vendor` workaround alone.
4. Add guarded runtime deployment/sync behavior for the host bind-mounted sources.
5. Build exactly one final Android APK containing the Expo 57 picked-image persistence fix.
6. Run final device smoke once on that APK.
7. If email/password-recovery flows are in production acceptance scope, prove their live delivery/recovery path before declaring total auth closure.
8. Only then perform the explicit app traffic authority cutover to Oracle.

Do not build repeated APKs during server canonicalization.

## Email/password note

Google/session auth is currently working. However, previous repository work indicated real email delivery/password recovery/device verification still needed live acceptance if those flows are considered part of launch scope. Do not confuse this with the already-stable Google/session path.

## Operational cautions

- Do not install a second PostgreSQL inside Docker. Native PostgreSQL 17 on Core is the intentional current architecture.
- Do not casually restart Auth/API while they are healthy; earlier repeated restarts correlated with a temporary app logout event.
- Do not re-add diagnostic traces after a feature has already been proven unless a new regression appears.
- Do not expose Core SSH publicly just for file transfer.
- Do not cut over Supabase without explicit user approval.
- Do not put secrets, env values, private keys, tokens, or credentials into GitHub.

## Recommended first action for the next chat

Read this file, inspect these two branches:

- `build/oracle-android-20260909`
- `chore/oracle-live-runtime-canonical-20260910`

Then continue implementation on:

`chore/oracle-runtime-cutover-prep-20260910`

First close the canonical runtime + Oracle DB migration/operator source. Do not touch the live traffic switch yet.

## Desired end state

The finish line is:

**Canonical Oracle runtime + durable DB functions + durable OCI dependency/deploy path + one final fixed APK + final smoke = explicit Oracle production cutover.**

After cutover, Supabase is cold rollback only, then removed after stability/restore acceptance.
