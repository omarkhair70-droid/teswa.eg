# Teswa OCI Lane 3 — Continuation Handoff — 2026-09-04

**Branch:** `infra/oracle-platform-20260903`

**Purpose:** Continue Lane 3 (OCI platform) in a fresh chat without losing state.

## Scope

Lane 3 owns the Teswa OCI foundation only.

Do not touch:
- Balcona
- Nova beyond already-approved resize
- Supabase production authority
- DNS production cutover
- live-data migration

Parallel lanes:
- Chat/Lane 2: `refactor/backend-boundary-20260903`
- Chat/Lane 3: `infra/oracle-platform-20260903`
- Chat/Lane 4: `migration/supabase-to-oci-20260903`

## Closed / green

### OCI foundation

- Home region: `me-jeddah-1`
- Dedicated `teswa-platform` compartment
- Teswa VCN `10.20.0.0/16`
- public edge subnet `10.20.0.0/24`
- private app subnet `10.20.10.0/24`
- private data subnet `10.20.20.0/24`
- explicit NSGs
- no public PostgreSQL
- no public SSH
- NAT for private app outbound
- remote Terraform state in private versioned bucket `teswa-terraform-state`
- private `teswa-media`
- private versioned `teswa-backups`
- DEFAULT vault `teswa-vault`
- notifications topic `teswa-ops`
- Terraform state/drift gates previously green

### Compute

`teswa-edge-01`
- E2.1.Micro
- public edge subnet
- public IP
- future native Caddy/TLS/reverse proxy
- intentionally minimal

`teswa-core-01`
- A1 Flex
- 1 OCPU / 6 GB RAM
- private app subnet
- no public IP
- future PostgreSQL 17 + API + Realtime + Workers

Nova was previously resized from 2/12 to 1/6 after read-only metrics review. No further Nova resize is approved.

### Run Command / privilege recovery

Run Command IAM path is green:
- dynamic group `teswa-run-command-instances`
- policy `teswa-run-command-policy`
- same-instance restriction

Core/Edge OS inventory green.

The major blocker was `ocarun` lacking passwordless sudo. Recovery used OCI Instance Console Connection + Windows OpenSSH tunnel + VNC + GRUB `init=/bin/bash` + serial root shell.

The following sudoers entry is now installed and validated:

`/etc/sudoers.d/101-oracle-cloud-agent-run-command`

Content:

`ocarun ALL=(ALL) NOPASSWD:ALL`

Validated:
- `visudo_exit=0`
- mode `440 root:root`
- `serial_repair_payload=PASS`

After normal reboot, guarded Core prerequisites succeeded through Run Command:
- `run_command_state=SUCCEEDED`
- `exit_code=0`
- `run_as_user=ocarun`
- SELinux Enforcing
- firewalld active
- `git` installed
- `podman` installed

Consider VNC/GRUB/serial recovery CLOSED unless a new exceptional failure requires it.

## Temporary admin resources still requiring later cleanup

The privilege-bootstrap recovery path left temporary administrative OCI resources that must be removed only after Lane 3 runtime bootstrap is stable:
- OCI Bastion
- TCP/22 Core ingress from Bastion private endpoint /32
- temporary Bastion security list/association on private app subnet
- Bastion Cloud Agent plugin state
- manually-created Instance Console Connection

Do not delete these mid-recovery if still needed. Once PostgreSQL and normal Run Command are fully green, plan intentional cleanup with zero public SSH exposure.

## Current active task: PostgreSQL 17 native bootstrap

Target design:
- PostgreSQL 17 native on `teswa-core-01`
- localhost-only initially: `127.0.0.1:5432`
- no firewall port 5432 opening
- empty rehearsal DB `teswa_rehearsal`
- no migration credentials emitted
- no live-data migration
- Supabase remains production authority

Primary helper:

`infra/oci/inventory/apply-phase4-core-postgres17.sh`

Bootstrap doc:

`docs/infra/OCI_PHASE4_POSTGRES17_BOOTSTRAP_2026-09-04.md`

### What happened

First PostgreSQL bootstrap run:
- PGDG repo installed
- Run Command ended `FAILED`, exit 2 during DNF stage

Read-only diagnostic proved PostgreSQL packages were actually installed:
- `pgdg-redhat-repo-42.0-66.rhel9PGDG.noarch`
- `postgresql17-17.11-1PGDG.rhel9.8.aarch64`
- `postgresql17-server-17.11-1PGDG.rhel9.8.aarch64`
- `postgresql17-contrib-17.11-1PGDG.rhel9.8.aarch64`

Bootstrap was then made package-idempotent.

Second bootstrap run:
- syntax green
- `required_packages_already_present=true`
- Run Command failed quickly with exit 1 after that point

A focused initdb diagnostic then proved:
- `marker_present=true`
- `pg_version_present=true`
- `service_active=inactive`
- `service_enabled=disabled`
- locale is valid (`en_US.UTF-8`)
- therefore cluster initialization DID complete
- failure is after initdb, before/around config install or systemd enable/restart

This means **do not reinitialize or delete PGDATA**.

### Latest code state

Immediately before this handoff, `apply-phase4-core-postgres17.sh` was updated in commit:

`0195e3b83beb9f94bb0197d212ce28ba04d1b050`

This latest fix has **not yet been runtime-verified by the user**.

The fresh chat must first inspect that commit/file and continue from the current live state. Do not assume PostgreSQL foundation is green until a fresh run produces the final verification output.

Expected success gate:

```text
run_command_state=SUCCEEDED
exit_code=0
postgres_major=17
listen_addresses=127.0.0.1
port=5432
rehearsal_db=teswa_rehearsal
public_relations=0
firewall_5432_open=false
credentials_created=false
data_migration=none
postgres17_bootstrap=PASS
```

If it fails again, use a read-only focused diagnostic around:
- ownership/mode of `postgresql.conf`
- exact systemd unit status
- journal for `postgresql-17`
- effective config
- socket/listen state
- `pg_hba.conf`

Do not run destructive initdb/PGDATA cleanup because `PG_VERSION` already exists.

## Lane 4 dependency

Lane 4 migration branch is waiting for a private PostgreSQL 17 target handoff.

Known migration facts:
- 46 public tables
- 104 foreign keys
- preserve UUIDs
- source DB roughly 6.5 MiB
- storage roughly 120.7 MiB
- target must start empty
- strategy is fresh full final refresh under write freeze, not permanent dual-write/CDC first cutover
- Supabase remains rollback authority until explicit cutover

Only after `postgres17_bootstrap=PASS` should Lane 3 prepare a safe rehearsal target handoff to Lane 4. Lane 3 itself must not migrate the production data.

## After PostgreSQL green

Lane 3 remaining sequence:
1. Finish PostgreSQL 17 verification and Lane 4 target handoff.
2. Bootstrap Teswa API runtime on Core.
3. Bootstrap Realtime runtime on Core.
4. Bootstrap Workers on Core.
5. Use separate Podman/systemd service/restart boundaries.
6. Bootstrap native Caddy on Edge.
7. Add internal-only routing/smoke path before any production DNS change.
8. Add monitoring/logging.
9. Add PostgreSQL logical backups to `teswa-backups` and perform restore drill.
10. Run internal smoke tests.
11. Clean up temporary Bastion/SSH/console recovery resources.
12. Confirm Terraform drift is zero.

Still forbidden throughout:
- no Supabase shutdown
- no live production cutover
- no DNS switch
- no public PostgreSQL
- no public SSH
- no secrets committed to Git/Terraform/mobile config/output

## Fresh-chat start instruction

Use this exact instruction in a new chat:

> Continue Teswa OCI Lane 3 from `docs/infra/OCI_LANE3_CONTINUATION_HANDOFF_2026-09-04.md` on branch `infra/oracle-platform-20260903`. Read the handoff and the latest PostgreSQL helper first. Current live state: PG17 packages are installed, initdb completed (`PG_VERSION` exists), service was still inactive/disabled at the last diagnostic, and commit `0195e3b83beb9f94bb0197d212ce28ba04d1b050` contains the latest unverified fix. Do not reinitialize PGDATA, do not touch Supabase production, Nova, Balcona, DNS, or live data. Continue until PostgreSQL is GREEN, then prepare Lane 4 target handoff and continue API/Realtime/Workers/Caddy/monitoring/backups/smoke/cleanup.
