# Teswa Lane 4 — Final Continuation Handoff

Date: 2026-09-06
Branch: `migration/supabase-to-oci-20260903`
Previous remote branch HEAD before this handoff: `99134c97b9877fe565a3d06c89c7d8de2751702b`
Scope of this document: record the exact verified Lane 4 reality reached after that branch HEAD. Documentation only. No migration action is performed by this handoff.

## Executive standing point

Lane 4 has completed and GREEN-verified the Oracle rehearsal database public-data migration gate.

The current authoritative production backend is still Supabase. `teswa_rehearsal` on `teswa-core-01` is a rehearsal/shadow PostgreSQL target, not production authority.

The next unstarted gate is **Auth / identity continuity**, beginning with preservation and verification of the existing 32 user UUIDs and replacement of Supabase Auth authority behind the Teswa backend boundary.

No production cutover has occurred. Supabase has not been deleted and remains required by production.

## Related infrastructure state

Lane 3 is closed/GREEN and should not be re-opened unless Lane 4 exposes a concrete infrastructure dependency.

Final verified Lane 3 result:

```text
terraform_drift_exit=0
lane4_iam_preserved=true
lane3_final_drift=PASS
lane3_closeout=PASS
```

The Lane 4 IAM resources were explicitly preserved by the final Lane 3 drift gate.

## Source and target

### Supabase source

Project ref:

```text
nvgxjvbsyvnfdakqhswq
```

Known source PostgreSQL version at audit time:

```text
server_version_num=170006
```

Supabase remains production authority at this standing point.

### OCI rehearsal target

Instance:

```text
teswa-core-01
```

PostgreSQL:

```text
17.11
server_version_num=170011
127.0.0.1:5432
```

Rehearsal database:

```text
teswa_rehearsal
```

PostgreSQL is not publicly exposed.

## Verified work completed after branch HEAD 99134c97

The remote migration branch itself remained at `99134c97b9877fe565a3d06c89c7d8de2751702b` while the following runtime/evidence work was executed from OCI Cloud Shell and `teswa-core-01`. These results therefore existed as operational evidence rather than post-99134c97 implementation commits until this handoff commit.

### 1. Read-only Lane 4 entry gates

A read-only entry-gate run completed successfully.

Evidence directory:

```text
$HOME/teswa-migration-evidence/teswa-lane4-entry-20260904T032124Z
```

Verified result:

```text
lane4_entry_readonly_gates=PASS
```

No production cutover was performed by the gate.

### 2. Public-data source snapshot

A public-data PostgreSQL snapshot was captured from the authoritative Supabase source.

Evidence directory:

```text
$HOME/teswa-migration-evidence/teswa-public-data-20260904T042822Z
```

The snapshot included:

```text
public-data.dump
```

The dump SHA was verified during capture.

### 3. Portable rehearsal bundle

A portable rehearsal bundle was assembled from the validated baseline plus the captured data dump.

Bundle directory:

```text
$HOME/teswa-migration-evidence/rehearsal-20260904T044927Z
```

Bundle contents included:

```text
portable-baseline/
data/public-data.dump
evidence/source-manifest.json
evidence/data-copy-plan.json
evidence/source-structural-gate.json
SHA256SUMS
```

Archive:

```text
/home/omar_khair/teswa-migration-evidence/database-rehearsal-20260904T044927Z.tar.gz
```

Archive size:

```text
349K
```

Archive SHA256:

```text
425804a991e63984e4a2ccc6472704d636afe63644a08bc213a7db878403bc2e
```

### 4. Rehearsal bundle transfer to OCI Object Storage

The rehearsal database archive was uploaded to OCI Object Storage.

Bucket:

```text
teswa-backups
```

Object:

```text
lane4-rehearsal/20260904T044927Z/database-rehearsal-20260904T044927Z.tar.gz
```

Upload/download hashes matched.

Verified result:

```text
lane4_rehearsal_artifact_upload=PASS
```

This transferred only the rehearsal migration artifact. It did **not** constitute migration of the application media/storage estate.

### 5. Target preflight

`teswa-core-01` and PostgreSQL 17 were validated as the intended rehearsal target.

The target was initially empty before rehearsal loading and was accessed through OCI Run Command rather than public PostgreSQL exposure.

Target preflight result was PASS.

### 6. First target-load attempt and failure-state determination

An early all-in-one load attempt incorrectly concatenated baseline SQL and data SQL into a global transaction wrapper. The baseline files contain their own transaction boundaries, so this approach was abandoned.

Read-only inspection proved that the failed attempt had persisted a partial schema:

```text
public_tables=46
public_views=0
public_enums=12
public_constraints=0
database_mutation=none
lane4_failure_state_inspection=PASS
```

This failure was contained to the rehearsal database. It did not mutate the Supabase source and did not perform production cutover.

The checked-in staged loader order was then treated as authoritative:

1. `00-extensions.sql`
2. `10-structure.sql`
3. `pg_restore --data-only --single-transaction --exit-on-error`
4. `20-integrity.sql`
5. `30-public-foreign-keys.sql`

### 7. Clean staged rehearsal reload

The partial `teswa_rehearsal` state was deliberately replaced with a clean rehearsal-only database and the bundle was applied in the correct staged order.

The successful run completed with exit code 0.

The staged loader assertions required the final rehearsal structure to satisfy:

```text
public_tables=46
public_views=1
public_enums=12
public_public_fks=83
```

The command completed successfully, so those assertions passed.

No Supabase mutation and no production cutover occurred.

### 8. Snapshot row-count parity

A read-only source-manifest vs Oracle rehearsal row-count comparison was executed across all public tables.

Exact GREEN result:

```text
source_tables=46
source_deep=false
source_total_rows=5600
oracle_total_rows=5600
row_count_mismatches=0
oracle_tables=46
database_mutation=none
lane4_snapshot_row_parity=PASS
```

This proved that the rehearsal target contained the same per-table row counts as the captured source snapshot.

### 9. Deep row and primary-key parity

Because the captured source manifest had `source_deep=false`, a separate deep snapshot parity gate was executed.

A temporary verification database was reconstructed independently from the same rehearsal snapshot and compared against `teswa_rehearsal` using deterministic row-content and primary-key-set checksums.

Exact GREEN result:

```text
verification_snapshot_restore=PASS
tables_checked=46
row_count_mismatches=0
row_checksum_mismatches=0
pk_checksum_mismatches=0
lane4_snapshot_deep_parity=PASS
verification_database_cleanup=PASS
teswa_rehearsal_mutation=none
supabase_mutation=none
lane4_database_data_gate=PASS
```

The temporary verification database was cleaned up after the comparison.

### 10. Database public-data migration gate status

The rehearsal database public-data migration gate is therefore closed/GREEN for the captured snapshot:

```text
DATABASE PUBLIC DATA MIGRATION GATE = GREEN
```

This means the 46-table public dataset represented by the rehearsal snapshot has been validated for:

- row counts
- deterministic row content checksums
- primary-key set checksums
- independent snapshot reconstruction

It does **not** mean production has been cut over to Oracle.

## Known source baseline relevant to the remaining work

### Auth / identity baseline

Verified source counts from the audit baseline:

```text
auth.users=32
auth.identities=32
public.profiles=32
Google identities=31
email identities=1
```

Critical invariant:

```text
Preserve all existing user UUIDs exactly.
```

There are 21 direct public foreign-key relationships to `auth.users` in the current Supabase model. A provider-neutral Oracle/Teswa-owned identity equivalent remains to be completed and proven.

### Storage baseline

Verified Supabase Storage inventory:

```text
9 buckets
154 objects
126,519,319 bytes (~120.7 MiB)
```

Buckets:

```text
contextual-voice-messages
deal-voice-messages
direct-chat-media
direct-voice-messages
dolab-media
item-images
item-videos
profile-images
story-media
```

The application storage/media estate has **not** yet been migrated or parity-proven on OCI Object Storage. The only Object Storage transfer proven so far is the Lane 4 rehearsal database artifact in `teswa-backups`.

### Realtime baseline

Current Supabase Realtime publication includes:

```text
deal_message_reads
deal_messages
direct_message_attachments
direct_message_reactions
direct_messages
direct_typing_state
```

Replacement runtime behavior has not yet been proven on OCI.

### Supabase Edge Functions still relevant

Known functions:

```text
delete-account
run-smart-reengagement-notifications
send-notification-push
stream-chat-token
stream-direct-message-webhook
```

The corresponding Teswa-owned runtime/worker behavior has not yet been proven as a production replacement.

## What has NOT yet been proven

Do not interpret `lane4_database_data_gate=PASS` as full Lane 4 completion.

The following remain OPEN:

1. **Auth / UUID continuity**
   - existing 32 users preserved through the Oracle/Teswa-owned identity path
   - Google identity continuity
   - email identity continuity
   - token/session verification
   - current-user resolution
   - signup/profile bootstrap
   - refresh/logout
   - account deletion
   - replacement of public-to-`auth.users` relationships

2. **Application media / Storage migration**
   - all 9 buckets
   - all 154 application objects
   - exact byte/hash parity
   - public/private semantics
   - signed/private access
   - upload/download/delete behavior
   - provider-neutral URL/key mapping

3. **RPC / database-domain runtime parity**
   - required public RPCs/functions
   - `auth.uid()`-dependent behavior
   - authorization semantics formerly enforced by RLS
   - triggers/business invariants
   - SECURITY DEFINER semantics where still required

4. **Realtime replacement**
   - send/receive
   - ordering
   - duplicate protection
   - reconnect/catch-up
   - read receipts
   - typing
   - attachments
   - reactions

5. **Workers / notifications / scheduled behavior**
   - push dispatch
   - smart re-engagement
   - scheduled/cron behavior
   - account lifecycle jobs
   - remaining Stream/Supabase function dependencies

6. **Lane 2 Oracle adapter / application runtime switch**
   - Oracle/OCI implementation under the existing Teswa backend boundary
   - removal of direct production Supabase dependencies from screens/runtime

7. **Full product E2E on Oracle**
   - Auth
   - Onboarding
   - Home
   - Discover
   - Item
   - Add Item
   - Likes
   - Offers
   - Deals
   - Messages
   - Direct Messages
   - Attachments
   - Reactions
   - Typing
   - Stories
   - Profile
   - Follow
   - Notifications
   - Settings
   - Dolab
   - Account deletion
   - media uploads
   - session persistence/restart

8. **Fresh final production capture and cutover**
   - production write freeze/control
   - fresh source DB capture at cutover watermark
   - fresh final Oracle production load
   - final storage delta
   - final auth continuity check
   - final parity and orphan checks
   - production runtime switch
   - production smoke
   - rollback decision gate

9. **Zero Supabase dependency proof**
   - DB traffic = 0
   - Auth traffic = 0
   - Storage traffic = 0
   - Realtime traffic = 0
   - Edge Function traffic = 0
   - no Supabase production secrets required

10. **Supabase retirement/deletion**
    - not started
    - not authorized by this handoff
    - must only happen after Oracle production authority and zero-dependency proof are GREEN

## Precise standing point

**Standing point at handoff:**

`Lane 4 database public-data rehearsal migration is GREEN and closed for the captured 5,600-row snapshot. Oracle infrastructure is GREEN/closed. Supabase is still production authority. The next gate is Auth / identity continuity for the existing 32 users with exact UUID preservation. Storage/media, RPC/runtime, realtime/workers, the Lane 2 Oracle adapter, full E2E, fresh final production cutover, zero-Supabase proof, and Supabase retirement have not yet been proven or completed.`

## Continuation rule

A continuation must start from **Auth / identity continuity**. Do not redo Lane 3, the rehearsal public-data load, row parity, or deep checksum parity unless a later fresh final-cutover capture intentionally requires a new database load/parity cycle.

Do not treat the old rehearsal snapshot as the final production cutover dataset. Final cutover requires a fresh source capture because production remains live on Supabase at this standing point.
