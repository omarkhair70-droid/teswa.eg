# Teswa OCI Phase 4 — PostgreSQL 17 Bootstrap — 2026-09-04

**Branch:** `infra/oracle-platform-20260903`

## Entry gate

Core prerequisite recovery is considered green from the live Run Command proof:

- Run Command reached `SUCCEEDED`;
- exit code was `0`;
- execution user was `ocarun`;
- SELinux remained `Enforcing`;
- firewalld remained active;
- privileged package installation proceeded without the previous sudo-password failure.

The GRUB/VNC/serial path is therefore recovery-only again, not the normal bootstrap path.

## PostgreSQL 17 target

The next guarded mutation installs native PostgreSQL 17 on `teswa-core-01` through OCI Run Command.

The bootstrap intentionally:

- uses the PostgreSQL Yum repository for EL9/aarch64;
- installs only PostgreSQL major 17 server/contrib packages;
- initializes the default PGDG 17 cluster only when no owned cluster exists;
- refuses to take over an existing unmarked cluster;
- binds PostgreSQL only to `127.0.0.1:5432` initially;
- does not open TCP/5432 in firewalld;
- enables SCRAM password encryption for future roles;
- creates an empty `teswa_rehearsal` database with no application credentials yet;
- verifies PostgreSQL major 17, localhost-only listening, port 5432, active service, closed firewall port, and zero user relations in the rehearsal database;
- creates no migration credentials and prints no secrets;
- performs no Supabase change, data migration, DNS switch, Nova change, or production cutover;
- requests no reboot.

## Guarded command

From `infra/oci/terraform`:

```bash
TESWA_ALLOW_CORE_POSTGRES17=YES \
  bash ../inventory/apply-phase4-core-postgres17.sh
```

Expected terminal gate:

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

Only after this gate is green should Lane 3 prepare the Lane 4 private PostgreSQL rehearsal handoff and credential-delivery boundary.
