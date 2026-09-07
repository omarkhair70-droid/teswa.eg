# Teswa — Lanes 2, 3 and 4 master continuation

**Snapshot:** 2026-09-07. **Repository:** `omarkhair70-droid/teswa.eg`. **Purpose:** preserve the actual migration history and give the next engineer a single starting point without restarting completed work. This is a documentation-only continuation; it is not a deployment, a merge, or a production cutover.

## 1. Read this first: what is actually finished?

Teswa is an existing application with production users and data. The goal is to replace its Supabase backend with a Teswa-owned Oracle Cloud implementation while preserving product behavior, identities, and data. It is not a new MVP, a screen redesign, or a request to rebuild the application.

**The production migration is not complete.** Supabase remains the production authority. The OCI database, storage, identity, SQL/RLS and supporting runtime work have substantial verified rehearsal coverage; Lane 2 has completed the provider-independent feature boundary; Lane 3 has completed its platform foundation/closeout; and Lane 4 has successfully deployed the private Core-to-Auth gateway. Subsequent integration work has added and tested Oracle Auth, complete-provider selection, and an authenticated HTTP transport. None of those facts proves that the whole mobile application is running on Oracle.

The next meaningful deliverable is an **actual Oracle-backed application rehearsal**, not another standalone abstraction: login, Home/Discover and item detail, publish with media, offer/deal, and messaging, followed by the remaining product surfaces. Public HTTPS, confirmation delivery, real Google/device sessions, account deletion and remaining jobs must also be closed before production authority changes.

### Evidence levels

Use these terms precisely in future reports:

- **CODED:** implementation exists in Git.
- **TESTED:** named test or CI run passed; state which one.
- **REHEARSAL VERIFIED:** a real OCI guest/database/service execution passed; retain its receipt.
- **APP VERIFIED:** the actual mobile/web client completed the flow against Oracle.
- **PRODUCTION VERIFIED:** live traffic is on Oracle and the relevant production checks passed.

A prepared artifact, a submitted Run Command, a green SQL test, or a green TypeScript build is not the next evidence level automatically. Historical failures below are not current blockers unless fresh evidence shows a recurrence.

## 2. Branches, exact checkpoints and integration state

| Work | Branch | Verified checkpoint / meaning |
| --- | --- | --- |
| Lane 2 backend boundary | `refactor/backend-boundary-20260903` | `6e6e3d427ca27a481573a6041660a4cf96ff0b8e`; implementation baseline `08e5608d347a87abeade49740df0642026221dc1` |
| Lane 3 OCI platform | `infra/oracle-platform-20260903` | `e08316faf6b544aa7b8ec53dce615beca839d30b`; final drift resume helper |
| Lane 3 takeover | `infra/oracle-ingress-takeover-20260907` | Created from Lane 3 head; no later implementation commit established in this record |
| Lane 4 migration | `migration/supabase-to-oci-20260903` | `937a1af13a56ce185f8390ac0fd84f27f122f394`; verified private Auth gateway standing point |
| Isolated Auth adapter | `integration/oracle-auth-adapter-20260906` | `879bcb11fcdb3d2443e9b742180aeee540b08583`; initial adapter/storage implementation |
| Auth contract hardening | `integration/oracle-auth-contract-20260907` | `8581a779`; contract CI reported green in the continuation |
| Runtime composition | `integration/oracle-runtime-composition-20260907` | **`3a4c20986549155e77d2205ca18a87b41b80ff21`**; latest verified integration checkpoint |

The final integration branch contains the newer Auth/transport work, but the migration branch is not automatically updated with it. The original Lane 2 and Lane 3 branches are also separate. **Inspect ancestry and diffs before assembling them; do not assume that a newer date means one branch contains all other lanes.** No final main merge is established here.

The previous runtime-composition commit `a761520d076ff2171ce27a372e806e0776b7fd65` added complete-provider selection. The subsequent transport work includes `d28959bc939e90b6de8cb1c49836cad3ef6d525a`, `8f219e9c14add832631c8c8592560d481b0d07e4`, and `3a4c20986549155e77d2205ca18a87b41b80ff21`. The verified CI run for the last checkpoint is **34089372556**, job **101639581204**, completed successfully: dependency install, Oracle Auth contract tests, Oracle HTTP transport tests, backend-provider composition tests, and `npm run typecheck:app`.

## 3. Lane 2 — what was completed

Lane 2's job was to remove Supabase knowledge from product-facing features, not to move production data. The final handoff records 65 feature-level direct Supabase imports at entry and **zero remaining legacy feature-level direct client imports** at closure. Its validation run was **33754388077**: dependency installation, backend boundary guard and TypeScript passed.

The dependency direction is now:

```text
Screen / feature
  -> Teswa domain helper
  -> teswaBackendRuntime
  -> Teswa-owned contract
  -> provider adapter
  -> Supabase today / Oracle implementation when complete
```

The existing provider implementation is isolated under `lib/backend/adapters/supabase/**` plus the provider client shell. The product-facing boundary covers Auth and account lifecycle; profiles/social graph; marketplace and listings; offers/deals; media; direct/contextual messaging and realtime; notifications; stories; discovery/City Pulse; Dolab; analytics; policy acceptance; reviews; and moderation/admin.

The detailed feature coverage includes login/signup/session bootstrap/external auth; profile and item media including video and voice; profile editing, followers, blocks, trust metrics; marketplace reads, likes, My Listings, archive/reactivate/delete/edit/publish, wanted tags and video discovery; offer/deal lifecycle; messages/reactions/typing/read state; story replies and discovery; Dolab persistence; analytics filtering; policy acceptance; reports/admin; and the account-deletion request boundary.

**Do not redo this as a screen-by-screen decoupling project.** Implement the existing contracts against Oracle and preserve their result/error semantics. Any genuine missing contract should be identified from the current code, not inferred from an old partial handoff. The original Lane 2 handoff explicitly did not claim OCI adapters, database migration, or production traffic switching.

Source: [Lane 2 final handoff](https://github.com/omarkhair70-droid/teswa.eg/blob/refactor/backend-boundary-20260903/docs/TESWA_BACKEND_BOUNDARY_FINAL_HANDOFF_2026-09-03.md).

## 4. Lane 3 — platform history and current meaning

### Foundation and topology

The measured OCI foundation was built in `me-jeddah-1`, in the dedicated `teswa-platform` compartment. It includes a VCN `10.20.0.0/16`, public edge subnet `10.20.0.0/24`, private app subnet `10.20.10.0/24`, private data subnet `10.20.20.0/24`, explicit NSGs, and NAT for private outbound traffic. Terraform state is remote in private/versioned `teswa-terraform-state`. The platform also has private `teswa-media`, private/versioned `teswa-backups`, `teswa-vault`, and the `teswa-ops` notification topic.

The current architecture uses `teswa-edge-01` (E2.1.Micro, public edge) and `teswa-core-01` (A1 Flex, 1 OCPU/6 GB, private app subnet). The Core private IP at the September 7 checkpoint is `10.20.10.176`; the Edge private IP is `10.20.0.218`. PostgreSQL is native on Core and localhost-only. API, realtime and workers have separate service/restart boundaries. The Edge is intentionally lightweight and uses native Caddy.

Nova was previously resized from 2 OCPU/12 GB to 1 OCPU/6 GB after a read-only metrics review to release capacity. That was a specific completed allocation decision, not permission for another resize. No reason exists to revisit Nova merely because the Teswa migration continues.

### Run Command and privilege recovery — closed history

The original guest inventory stayed `ACCEPTED` because the instance-principal Run Command authorization path was absent. The dedicated dynamic group `teswa-run-command-instances` and policy `teswa-run-command-policy` were added with the same-instance restriction. The verifier originally returned PASS while its matching-rule check was false; it was fixed to fetch the full dynamic-group resource and make the rule checks mandatory. IAM then verified green.

Run Command later needed recovery. A soft reset completed successfully; the original client timeout was too short for OCI's graceful shutdown window and was lengthened. This was not evidence that repeated resets were required.

The package bootstrap then failed because `ocarun` had no passwordless sudo. The historical recovery path involved temporary Bastion/SSH work, then an OCI Instance Console Connection, Windows OpenSSH tunnel, VNC, GRUB `init=/bin/bash`, and a serial root shell. The final sudoers entry was installed and validated at `/etc/sudoers.d/101-oracle-cloud-agent-run-command`:

```text
ocarun ALL=(ALL) NOPASSWD:ALL
```

The final proof was `visudo_exit=0`, mode `440 root:root`, followed by normal reboot and successful privileged Run Command. **This recovery is closed; it is not the normal execution path.**

Historical Bastion problems included: wrong initial target subnet; JSON stdin overwritten by a Python here-document; incorrect `--network-security-group-id` versus `--nsg-id`; Terraform `standard`/`STANDARD` enum drift; FIPS rejection of ED25519 ephemeral keys (RSA-3072 used); missing Bastion-side egress; wrong nested Security List port JSON path; a Terraform dependency cycle involving the Bastion endpoint IP; dynamic Cloud Shell client allowlisting; truncated Run Command output; and missing launch SSH metadata. The old Core was still pre-stateful when a controlled replacement with launch bootstrap metadata was selected. These are documented recovery events, not reasons to rebuild the current Core or recreate Bastion.

### PostgreSQL 17 — closed

The first PGDG package stage failed after packages had actually been installed. Initialization then succeeded, but an unprivileged `ocarun` check could not traverse PostgreSQL's mode-0700 data directory and falsely concluded that `PG_VERSION` was absent. The helper was corrected to perform privileged existence/version checks and to recognize the initialized cluster. No destructive reinitialization was needed.

Final verified result: PostgreSQL **17.11**, localhost `127.0.0.1:5432`, active service, `teswa_rehearsal` initially empty, no public 5432 opening, no migration credentials at the initial bootstrap, and `postgres17_bootstrap=PASS`. The initial empty-state result is historical; the rehearsal database has since received the Lane 4 schema/data/runtime.

### Subsequent platform closure

Lane 3 proceeded to the private API/realtime/worker shells, native Caddy, internal Edge-to-Core routing, logging/monitoring, backup/restore work and final drift/cleanup. The platform closeout is recorded as GREEN. The final drift helper at `e08316f` preserves existing Lane 4 read-only IAM resources rather than treating them as unwanted drift. A historical drift plan proposed **two destroys** when those IAM resources were omitted; that was a configuration/plan issue, not authorization to destroy them.

The old Core API on port 3100 was originally only a Python static/health shell. That fact was discovered and subsequently changed by Lane 4's verified Auth gateway deployment. Do not describe the old shell as the current API, and do not call the current Auth gateway a complete domain API.

**Current Lane 3 status:** foundation/closeout is already done; actual production HTTPS/API routing is an integration requirement, not a reason to replay all platform phases. The latest Lane 3 branch head provides a read-only final drift resume gate. Run it only when relevant to a current integration change or final platform verification, preserving existing optional IAM resources.

Sources: [OCI foundation](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_FOUNDATION_2026-09-03.md), [Phase 4 bootstrap history](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE4_BOOTSTRAP_2026-09-03.md), [September 4 continuation](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_LANE3_CONTINUATION_HANDOFF_2026-09-04.md), [verified PG17 bootstrap](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE4_POSTGRES17_BOOTSTRAP_2026-09-04.md), [Lane 4 target handoff](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_LANE4_POSTGRES_TARGET_HANDOFF_2026-09-04.md), [final drift helper](https://github.com/omarkhair70-droid/teswa.eg/blob/e08316faf6b544aa7b8ec53dce615beca839d30b/infra/oci/inventory/finish-lane3-final-drift.sh), [safe closeout helper](https://github.com/omarkhair70-droid/teswa.eg/blob/e08316faf6b544aa7b8ec53dce615beca839d30b/infra/oci/inventory/close-lane3-final-safe.sh).

## 5. Lane 4 — database, identity, storage and service work

### Source of truth and capture

The migration source is the existing Supabase project, not a new database invented for Oracle. The captured baseline records 78 repository migrations / 78 applied production migrations through `20260820164619_direct_request_send_semantics`, 46 public tables, one view, 12 enums, 188 indexes, 249 constraints, 23 triggers, 99 public RLS policies, 29 storage policies, 72 SECURITY DEFINER functions among 80 public functions, and 21 foreign keys to `auth.users`. Historical counts are snapshot measurements, not a claim that production cannot change.

Source capture is read-only. The tooling records structural manifests, row/PK checksums, identity fingerprints and storage metadata. It explicitly distinguishes application schema/data parity from provider-runtime parity: Supabase Auth, Storage, Realtime, PostgREST context, service roles and related functions cannot all be copied blindly as if they were ordinary portable SQL.

The migration assembled reviewed portable baseline layers, ordered data-copy plans and an empty target, rather than applying a raw Supabase dump to the target unchanged. The rehearsal data parity recorded **5,600 rows** and archive SHA-256 `425804a991e63984e4a2ccc6472704d636afe63644a08bc213a7db878403bc2e`. This is a verified historical rehearsal snapshot, not the final production refresh.

### Identity and Auth

The initial identity capture preserved 32 UUIDs and 32 identity mappings, with 21 cross-schema identity FKs adapted to `teswa_identity.users`. The source later had 33 identities while rehearsal still intentionally held 32; final refresh must reconcile the current source rather than silently calling the old snapshot complete.

Durable Oracle Auth sessions were implemented with database-backed session storage, short-lived access tokens, refresh rotation, replay rejection and logout revocation. Email/password/signup HTTP rehearsal tests passed. Google token verification validates signature, issuer, audience and time claims, but the positive real-device Google flow was explicitly deferred. Account confirmation delivery was not yet operational.

The current Auth service is loopback-only on `127.0.0.1:3110`. Its `/healthz` reports durable shadow mode; the current version uses a guarded bind and port. The server and mobile adapters must agree on the actual wire contract, not assume Supabase token semantics.

### Storage

The storage work includes bucket/key metadata capture, actual object-byte transfer and exact content-hash comparison. The recorded exact parity was **154 objects / 126,519,319 bytes**, across nine buckets. This closes that rehearsal copy/verification, but does not mean future source uploads are automatically included in the final cutover. Preserve object keys, ownership, signed/public URL semantics and media behavior when implementing the app-facing storage transport.

### SQL/RLS and domain runtime

The SQL runtime is not just a copied schema. Supabase `auth.uid()` behavior was replaced with `teswa_runtime.current_user_id()` / `require_user_id()`, backed by transaction-local `teswa.user_id`. The server must derive the UUID from a verified Oracle session, never trust a client-provided user-id header. Context must be set inside the transaction with the third `set_config` argument true, so it cannot leak between pooled requests.

The runtime work covers identity-linked policies and functions, marketplace/profile flows, offers/deals, direct/contextual messaging, notifications, story/discovery functions and related long-tail operations. Later final-DB-closure commits supersede earlier lists of missing RPCs. **Do not treat a September 4 or early September 6 gap list as the current implementation inventory.** Check the latest SQL and applied target evidence first.

Push and smart/domain workers were also ported for rehearsal. The post-RLS push compatibility proof is GREEN, including preclaim isolation, active-job bridge, worker presence and cleanup. The recorded worker result was `status=skipped`, `reason=rehearsal_send_disabled`, deviceCount 1. That proves the guarded worker path, **not actual outbound push delivery**. Real push delivery remains a later end-to-end verification concern, not a reason to redo the completed SQL bridge.

Realtime replacement and supporting worker/runtime rehearsals are recorded as completed. Their production integration and actual client behavior remain separate acceptance checks.

### Private Auth gateway — verified September 7

Before this work the Core API was only a health/static shell on `10.20.10.176:3100`, while Auth ran on loopback `127.0.0.1:3110`. The new private gateway forwards only supported Auth routes. It has bounded request/response sizes and concurrency, explicit route allowlisting, request validation, restricted header forwarding, guarded deployment and rollback.

- `20b7c41`: gateway, deployment/rollback tooling and nine HTTP route tests.
- `56c0256`: supported OCI upload guard and clearer CLI failures.
- `937a1af`: verified deployment, bounded readiness check and durable standing point.
- Deployment **SUCCEEDED / exit 0** at `2026-09-07T05:17:51.277Z`; guest execution 35.32 seconds.
- Nine HTTP tests passed locally and on Cloud Shell/Linux; guest checks passed for API/Auth health, missing session 401, invalid Google token 401, pending signup 503, unknown route 404 and active service.

The intermediate Windows socket-timeout test was later rerun successfully; its cause was not established. Do not turn it into a persistent Windows networking diagnosis. A previous deployment status printed as submitted/pending was not success; the later successful execution receipt resolved that uncertainty.

The gateway deliberately returns 503 for signup/resend while confirmation delivery is unavailable. It prevents a false user-facing success. It does not prove an email has been delivered.

**Edge is still not the public Auth ingress:** the last inspected Caddy site was `http://10.20.0.218:8080`, `auto_https off`, with health routes only. No public authenticated HTTPS route or app acceptance was established.

### Existing evidence and recovery

Cloud Shell migration evidence is stored under `~/teswa-migration-evidence/`. The verified gateway deployment is under `auth-gateway-20260907T051412Z/`, containing receipt, command, execution and artifact information. Its versioned artifact is retained in the existing private backup scope. Read the saved execution status before considering another deployment; a pending observation is not a reason to resubmit an already-successful mutation.

The old Run Command helper, OCI upload flags, Cloud Shell environment and stdout limits caused several operator-tooling corrections. These are not data-migration failures. Use the corrected scripts and actual execution receipts rather than repeating those historical attempts.

Sources: [Lane 4 current standing point](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/docs/TESWA_LANE4_CURRENT_STANDING_POINT_2026-09-07.md), [migration tooling and source snapshot history](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/README.md), [identity context](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/runtime-current-user-context.sql), [final DB closure](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/runtime-final-db-closure.sql), [private gateway](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/auth-api-shadow-gateway.py), [Auth server](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/auth-email-runtime-server.py).

## 6. September 6–7 application integration — what is actually in Git

### Initial Oracle Auth adapter

The isolated branch added `auth-storage.ts` and `auth-adapter.ts`. Session storage is separate from Supabase keys: SecureStore on native, AsyncStorage on web, memory fallback; corrupt stored sessions are cleared. The adapter maps Oracle user/session wire data to the existing AuthContract, handles password signup/login, Google ID-token exchange, refresh/session validation, logout and auth events. It requires a configured HTTPS Auth base URL. Browser OAuth start/complete is not yet implemented for Oracle.

The subsequent Auth contract branch hardened refresh concurrency, stale-session handling and delivery-failure semantics, with isolated tests. The continuation records successful CI at `8581a779`; inspect the actual workflow before attributing any later behavior to it.

### Complete-provider composition

The runtime-composition branch added `selectTeswaBackendRuntime`. It defaults to Supabase and requires an Oracle provider factory to supply the **entire** runtime: Auth, account, analytics, policies, media, marketplace, offers, deals, realtime, direct/contextual messaging, notifications, profiles, reviews, moderation, stories, discovery and Dolab. There is currently no complete Oracle factory in `runtime.ts`.

This is deliberate: Oracle Auth tokens cannot simply be handed to the Supabase data client. A missing Oracle capability must not silently fall back to Supabase under an Oracle session. The composition tests passed; that does not mean the Oracle provider is selectable or complete yet.

### Shared Oracle HTTP transport

The latest integration work added `lib/backend/adapters/oracle/http-transport.ts` and tests. It uses the Oracle Auth session, requires HTTPS, validates `/v1/...` paths, bounds responses, applies timeouts and maps HTTP failures without leaking tokens or request bodies. It is a reusable transport, **not a marketplace/offer/messaging API implementation**.

The final CI checkpoint is `3a4c209`, run 34089372556, all named steps successful. No production provider switch, actual Oracle app flow or public HTTPS deployment was performed by these integration commits.

The next engineer should work from this code rather than creating yet another Auth adapter or HTTP wrapper.

Sources: [runtime composition](https://github.com/omarkhair70-droid/teswa.eg/blob/3a4c20986549155e77d2205ca18a87b41b80ff21/lib/backend/runtime-composition.ts), [current runtime factory](https://github.com/omarkhair70-droid/teswa.eg/blob/3a4c20986549155e77d2205ca18a87b41b80ff21/lib/backend/runtime.ts), [Oracle Auth adapter](https://github.com/omarkhair70-droid/teswa.eg/blob/3a4c20986549155e77d2205ca18a87b41b80ff21/lib/backend/adapters/oracle/auth-adapter.ts), [Oracle HTTP transport](https://github.com/omarkhair70-droid/teswa.eg/blob/3a4c20986549155e77d2205ca18a87b41b80ff21/lib/backend/adapters/oracle/http-transport.ts), [successful CI run](https://github.com/omarkhair70-droid/teswa.eg/actions/runs/34089372556).

## 7. Actual unresolved work — two immediate closure tracks

The owner wants completion, not a new planning cycle. Use the following as acceptance criteria and execute missing work end to end. The order inside a track can change when dependencies require it.

### Track A — Oracle-backed application rehearsal

**Goal:** a test build performs real product operations against Oracle while production remains unchanged.

1. Inspect current branch ancestry and integrate the completed Lane 2 boundary, latest migration runtime and September 7 integration work into an appropriate integration base without overwriting unrelated user changes.
2. Implement the actual Oracle domain HTTP endpoints/adapters against the already-ported SQL and services. Start with a thin vertical slice: authenticated session -> marketplace feed/detail -> publish with media -> offer/deal -> direct message. Avoid recreating SQL that is already present.
3. Preserve all existing contract outputs and error codes. Connect real media upload/download and the existing realtime behavior, rather than returning hard-coded success or placeholder records.
4. Compose the full Oracle provider and run the existing boundary guard, relevant contract tests, TypeScript and actual runtime tests.
5. Use an isolated test build and rehearsal accounts to prove the flow on the actual app. Record the exact build, API version, database/environment and observed results. A mock/test-only pass does not close the app gate.

**Done when:** the stated user journey works against Oracle from the client, with evidence of the real backend operations. Remaining product surfaces still need Track C before cutover.

### Track B — Auth, HTTPS and service completion

**Goal:** the Oracle backend can safely serve real authenticated clients and reproduce the existing account experience.

1. Inspect existing Google configuration and current native/browser flows. Reuse suitable existing Google client IDs and configuration. Do not ask the owner to recreate a Google project merely because the backend changes. Verify the actual Android Google ID-token flow and mapping to the preserved Teswa UUID. Support the product's required fallback/browser behavior deliberately rather than silently sending Oracle sessions back through Supabase.
2. Establish a working public HTTPS route to the intended API/Auth services. Choose the address/TLS solution from the actual available OCI and provider options. The owner has said there is no separately purchased domain; **do not make buying a domain, creating Cloudflare, or purchasing a mail provider a prerequisite to starting engineering**. A suitable temporary HTTPS address may be used for rehearsal; production address/identity and callback requirements must be established before final release.
3. Implement real confirmation-token delivery, verification and resend semantics. Inspect existing account/email configuration first. The old inventory found no OCI email sender/domain or recognized SMTP-provider environment names in the queried scope; that is not proof that no external account exists. Do not claim signup is complete while delivery is still 503/provider_pending. Determine the actual provider requirement only when needed.
4. Verify password login, Google login, refresh/restart persistence, logout/revocation and new-user confirmation on a device. Preserve existing accounts/UUIDs and user-visible behavior.
5. Complete the Oracle account-deletion replacement and remaining production jobs, including actual authorization and downstream cleanup. Reuse the already-ported worker/runtime work and verify outbound effects separately from dry-run/disabled-send tests.

**Done when:** the required account and supporting services work through Oracle without hidden Supabase authority, and the real-device evidence is recorded.

### Track C — full product acceptance

After the initial vertical slice, cover the complete existing surface: Auth/Onboarding, Home, Discover, item detail/add/edit/lifecycle, Offers, Deals, direct/contextual messaging, Stories, Profile/social graph, Notifications, Settings/policies/account lifecycle, Dolab, media, reviews, moderation and relevant background jobs. Verify error/empty/loading and authorization outcomes where the contract requires them. Close actual defects, not hypothetical ones.

**Done when:** the test build's required product behavior is functionally equivalent and a dependency inventory shows no unintentional Supabase calls in Oracle mode.

### Track D — controlled production cutover

Only after the above acceptance: capture a fresh source snapshot/delta; coordinate a write freeze; load the final target safely; reconcile current identities, rows, object bytes and hashes; verify runtime permissions and rollback; switch traffic in a controlled way; and run production smoke checks. The historical 5,600-row/32-identity/154-object rehearsal is not a current production snapshot.

Supabase remains the rollback source until the controlled cutover is verified. Retiring the old provider is a later explicit decision; the existing approval to work toward full migration is not proof that deletion or irreversible retirement has already been authorized or performed.

## 8. Historical problems — correct interpretation for future chats

| Historical observation | Actual conclusion / resolution | What not to infer now |
| --- | --- | --- |
| Run Command stuck `ACCEPTED` | Missing instance-principal IAM was repaired; later execution works. Normal delivery can still take minutes. | Every ACCEPTED command is broken or requires a reset. |
| IAM verifier printed false but PASS | Verifier defect fixed; matching rule fetched and enforced. | IAM remains unconfigured. |
| Soft reset exceeded client timeout | OCI later completed; helper wait corrected. | Another reboot is automatically required. |
| `ocarun` sudo password failure | One-time console recovery installed validated sudoers. | Privilege recovery must be repeated for current work. |
| Bastion SSH remote close | Historical subnet/egress/ingress/key/allowlist problems investigated; final recovery moved through console. | Current network is necessarily broken or Bastion must be recreated. |
| PG17 package/initdb failures | Packages/cluster existed; idempotence and privileged PGDATA checks fixed; bootstrap verified. | PGDATA must be deleted or initialized again. |
| Terraform proposed unexpected destroys | Configuration/optional IAM drift; final helper preserves present Lane 4 IAM. | Apply the old destructive plan. |
| Long Run Command output truncated | OCI output limit; use bounded output/durable evidence. | The hidden part proves success or failure. |
| Gateway submitted/pending | Later receipt proves deployment SUCCEEDED/exit0. | Gateway is still undeployed. |
| Intermediate Windows socket timeout | Diagnostic rerun, Linux and guest tests passed; cause undetermined. | Persistent Windows failure or a reason to block Oracle work. |
| No OCI DNS/email records | Inventory limited to queried OCI scope; owner has no purchased domain. | A paid domain/Cloudflare/mail subscription is mandatory now. |
| Google negative-token test passed | Invalid token rejection proved. | Real positive Google login/device persistence is already verified. |
| Push worker returned skipped/send_disabled | Post-RLS worker compatibility passed with outbound disabled. | Real notification delivery has been proven. |
| Old RPC gap lists | Subsequent SQL/runtime commits closed additional functions. | Rebuild every function listed in an older handoff. |
| HTTP transport/CI green | Client plumbing and contract tests passed. | Full Oracle domain API or mobile E2E is complete. |

The actual production risk is not that every historical issue may recur. It is switching authority before the replacement behavior and current data have been verified. Keep the real safeguards while removing obsolete blockers from the task list.

## 9. Operator notes that matter for continuation

- Use the repo's actual current state and saved evidence; do not replay setup merely to generate a fresh green result.
- OCI Run Command's TEXT content is bounded (historically a 4 KiB payload limit), and plain output can be truncated. The existing tooling uses small bootstraps, private versioned artifacts and durable receipts for larger work.
- Core uses OCI SDK/Instance Principal for Object Storage; do not assume the OCI CLI is installed in the guest. Cloud Shell has the OCI CLI.
- Historical Cloud Shell scripts required `export USER=$(id -un)` in some environments. Avoid interactive `set -e`/`set -u` surprises and shell-reset commands; use guarded scripts.
- Do not put database passwords, service-role keys, OAuth secrets or full connection strings into Git, logs, chat or mobile environment variables. This is a concrete credential-handling requirement, not a reason to avoid authorized read-only Supabase inspection.
- The current source migration connection may be used for authorized read-only inspection/capture. Production DDL/DML belongs only to an explicitly approved migration/cutover operation.
- Preserve existing production users, data, UUIDs and object keys. Do not silently make a new user identity or a separate incompatible account universe.
- Keep the current production app running on Supabase until the Oracle candidate is actually ready. No hidden Oracle Auth + Supabase data hybrid; no blind merge to main.
- Do not ask the owner for a domain, paid service, credentials or a manual task that can be resolved from existing authorized code/configuration first. Ask only for an actual missing external authorization or action, and explain exactly why.
- Do not promise a duration or percentage complete from commit count. Report the finished user-visible flow, remaining acceptance gates and real blockers.

## 10. Source index for the complete historical record

This document consolidates the verified history; the linked original records remain the detailed source for exact commands, historical plan reviews and execution evidence. They are not all current-state instructions.

### Lane 2

- [Final backend boundary handoff](https://github.com/omarkhair70-droid/teswa.eg/blob/refactor/backend-boundary-20260903/docs/TESWA_BACKEND_BOUNDARY_FINAL_HANDOFF_2026-09-03.md)
- [Backend contracts](https://github.com/omarkhair70-droid/teswa.eg/tree/refactor/backend-boundary-20260903/lib/backend/contracts)
- [Supabase adapters](https://github.com/omarkhair70-droid/teswa.eg/tree/refactor/backend-boundary-20260903/lib/backend/adapters/supabase)
- [Boundary validation run 33754388077](https://github.com/omarkhair70-droid/teswa.eg/actions/runs/33754388077)

### Lane 3

- [Measured inventory decision](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_MEASURED_INVENTORY_DECISION_2026-09-03.md)
- [Foundation](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_FOUNDATION_2026-09-03.md)
- [Phase 1 topology](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE1_TOPOLOGY_2026-09-03.md)
- [Phase 1 plan review](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE1_PLAN_REVIEW_2026-09-03.md)
- [Phase 1 apply](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE1_APPLY_2026-09-03.md)
- [Phase 2 capacity decision](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE2_CAPACITY_DECISION_2026-09-03.md)
- [Phase 2 apply](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE2_APPLY_2026-09-03.md)
- [Phase 4 bootstrap and recovery history](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE4_BOOTSTRAP_2026-09-03.md)
- [September 4 continuation](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_LANE3_CONTINUATION_HANDOFF_2026-09-04.md)
- [PG17 verified bootstrap](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_PHASE4_POSTGRES17_BOOTSTRAP_2026-09-04.md)
- [Lane 4 PG target handoff](https://github.com/omarkhair70-droid/teswa.eg/blob/infra/oracle-platform-20260903/docs/infra/OCI_LANE4_POSTGRES_TARGET_HANDOFF_2026-09-04.md)
- [Final drift resume](https://github.com/omarkhair70-droid/teswa.eg/blob/e08316faf6b544aa7b8ec53dce615beca839d30b/infra/oci/inventory/finish-lane3-final-drift.sh)
- [Safe closeout](https://github.com/omarkhair70-droid/teswa.eg/blob/e08316faf6b544aa7b8ec53dce615beca839d30b/infra/oci/inventory/close-lane3-final-safe.sh)
- [All platform tooling](https://github.com/omarkhair70-droid/teswa.eg/tree/infra/oracle-platform-20260903/infra/oci)

### Lane 4 and subsequent integration

- [September 7 current standing point](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/docs/TESWA_LANE4_CURRENT_STANDING_POINT_2026-09-07.md)
- [Migration tooling README](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/README.md)
- [All migration tooling](https://github.com/omarkhair70-droid/teswa.eg/tree/937a1af/scripts/oci-migration)
- [Database source of truth](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/docs/DATABASE_SOURCE_OF_TRUTH.md)
- [Runtime identity SQL](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/runtime-current-user-context.sql)
- [Final DB runtime closure](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/runtime-final-db-closure.sql)
- [Auth server](https://github.com/omarkhair70-droid/teswa.eg/blob/937a1af/scripts/oci-migration/auth-email-runtime-server.py)
- [Gateway and deployment tooling](https://github.com/omarkhair70-droid/teswa.eg/tree/937a1af/scripts/oci-migration)
- [Latest Oracle integration branch](https://github.com/omarkhair70-droid/teswa.eg/tree/integration/oracle-runtime-composition-20260907)
- [Latest integration commit](https://github.com/omarkhair70-droid/teswa.eg/commit/3a4c20986549155e77d2205ca18a87b41b80ff21)
- [Latest verified integration CI](https://github.com/omarkhair70-droid/teswa.eg/actions/runs/34089372556)

## 11. Exact next-chat starting instruction

> Continue Teswa's Supabase-to-Oracle migration from `docs/TESWA_LANES_2_3_4_MASTER_CONTINUATION_2026-09-07.md`. Read the current branch heads and the September 7 Lane 4 standing point first. Lane 2 boundary and Lane 3 foundation are complete; the private Auth gateway is deployed and verified. The latest integration checkpoint is `3a4c209` on `integration/oracle-runtime-composition-20260907`, with green Auth/transport/composition/TypeScript CI, but no complete Oracle app provider or production cutover. Preserve existing work and production data. Inspect the current implementation and evidence, integrate the relevant branches safely, and carry the remaining work through real Oracle-backed application and Auth/HTTPS/service acceptance. Reuse existing Google/configuration and do not require a purchased domain or provider without a demonstrated need. Do not restart completed SQL/identity/storage/Push/infra work or stop at another plan. Use the available authorized tools, make implementation decisions, commit and push coherent work, and ask the owner only for a genuinely unavailable external action. Report actual completed flows and remaining blockers; do not claim production closure until verified.

**Handoff rule:** future evidence supersedes this snapshot only when it actually proves the newer state. Preserve the old records as history, and update the current standing point instead of converting past failures into permanent restrictions.
