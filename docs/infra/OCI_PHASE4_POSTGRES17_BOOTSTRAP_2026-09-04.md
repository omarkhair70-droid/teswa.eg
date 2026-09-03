# Teswa OCI Phase 4 — PostgreSQL 17 Bootstrap — 2026-09-04

**Branch:** `infra/oracle-platform-20260903`

## Status

**GREEN / runtime verified on `teswa-core-01`.**

PostgreSQL 17 is now the private empty rehearsal target for the next migration lane. This does **not** change production authority: Supabase remains production and rollback authority until an explicit future cutover.

## Entry gate

Core prerequisite recovery was already green from the live Run Command proof:

- Run Command reached `SUCCEEDED`;
- exit code was `0`;
- execution user was `ocarun`;
- SELinux remained `Enforcing`;
- firewalld remained active;
- privileged package installation proceeded without the previous sudo-password failure.

The GRUB/VNC/serial path is recovery-only again, not the normal bootstrap path.

## PostgreSQL 17 target

The guarded bootstrap installs and owns native PostgreSQL 17 on `teswa-core-01` through OCI Run Command.

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

## Failure root cause and final fix

The first successful `initdb` left `PGDATA=/var/lib/pgsql/17/data` correctly owned by `postgres:postgres` with mode `0700`.

The Run Command payload executes as `ocarun`. The earlier helper used unprivileged checks such as:

```bash
[ -f "$PGDATA/PG_VERSION" ]
```

Because `ocarun` cannot traverse a `0700` PostgreSQL data directory, that test returned false even though `PG_VERSION` existed. The helper therefore incorrectly re-entered the initdb branch and failed before systemd configuration.

Read-only runtime diagnostic added in commit:

`09cdb4a321e4c0f65361b4aa942178819bdcc466`

The diagnostic proved:

- `/etc/teswa/phase4-postgres17-owned` present;
- `$PGDATA/PG_VERSION` present and equal to `17`;
- `PGDATA` owner `postgres:postgres`, mode `700`;
- `postgresql.conf` and `pg_hba.conf` owner `postgres:postgres`, mode `600`;
- service had not yet reached enable/start;
- no PostgreSQL journal entries existed;
- offline default config still reported `listen_addresses=localhost`, confirming the failure happened before the Teswa config block was installed.

Final fix commit:

`11972b04ed3a31881c7df175e7915de06937c0c8`

The helper now uses privileged existence/version checks (`sudo test` / `sudo cat`) and only enters initdb when root can prove `PG_VERSION` is absent. Existing initialized clusters emit `cluster_already_initialized=true`.

## Guarded command

From `infra/oci/terraform`:

```bash
TESWA_ALLOW_CORE_POSTGRES17=YES \
  bash ../inventory/apply-phase4-core-postgres17.sh
```

## Verified live result

The final runtime verification completed successfully:

```text
run_command_state=SUCCEEDED
exit_code=0
run_as_user=ocarun
required_packages_already_present=true
cluster_already_initialized=true
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

The service was enabled by systemd during this successful run.

## Closed gate

PostgreSQL 17 foundation is **GREEN**.

Lane 3 may now hand the empty private rehearsal target to Lane 4 while retaining these invariants:

- no public PostgreSQL;
- no public SSH;
- no production DNS switch;
- no Supabase shutdown/change;
- no production data migration by Lane 3;
- no credentials in Git, Terraform output, mobile config, logs, or documentation.
