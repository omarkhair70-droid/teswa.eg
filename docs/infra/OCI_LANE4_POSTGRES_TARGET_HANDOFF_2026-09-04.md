# Teswa OCI Lane 4 — PostgreSQL Target Handoff — 2026-09-04

**Producer lane:** Lane 3 / `infra/oracle-platform-20260903`  
**Consumer lane:** Lane 4 / `migration/supabase-to-oci-20260903`

## Purpose

Hand off the verified empty PostgreSQL 17 rehearsal target on OCI to the migration lane without changing production authority or exposing the database publicly.

## Target state — GREEN

Target host:

- instance: `teswa-core-01`
- OCI subnet: private app subnet
- no public IP
- PostgreSQL: native PGDG PostgreSQL 17
- service: enabled and runtime-verified
- data directory: `/var/lib/pgsql/17/data`
- listen address: `127.0.0.1`
- port: `5432`
- rehearsal database: `teswa_rehearsal`
- public relations in rehearsal DB: `0`
- firewalld TCP/5432 exposure: `false`
- application/migration credentials created by Lane 3: `false`
- production data migrated by Lane 3: `none`

Verified gate:

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

Final PostgreSQL helper fix commit:

`11972b04ed3a31881c7df175e7915de06937c0c8`

Focused read-only runtime diagnostic commit:

`09cdb4a321e4c0f65361b4aa942178819bdcc466`

Detailed bootstrap evidence:

`docs/infra/OCI_PHASE4_POSTGRES17_BOOTSTRAP_2026-09-04.md`

## Production authority and rollback

This target is a **rehearsal target only** at this stage.

- Supabase remains the production database authority.
- Supabase remains the rollback authority until an explicit future cutover decision.
- No Supabase shutdown is authorized by this handoff.
- No production DNS switch is authorized by this handoff.
- No production write freeze is active merely because the target is ready.
- Lane 3 does not own or execute the source-data migration.

## Connectivity boundary

PostgreSQL intentionally listens on localhost only.

Therefore Lane 4 must **not** assume it can connect directly to port 5432 from another host or from the public Internet.

For rehearsal work, use a controlled execution path on `teswa-core-01` (for example, an explicitly guarded OCI Run Command helper) so database access remains local to Core. If a later architecture requires networked database access, that must be a separate reviewed change using private-only addressing/NSGs and must never create public PostgreSQL exposure.

Do not open `0.0.0.0:5432`, `::/0:5432`, a public-IP listener, or a public firewall rule to make migration convenient.

## Credential boundary

Lane 3 deliberately created no application or migration role/password.

Lane 4 may design the minimum rehearsal credential boundary when needed, but:

- do not commit credentials to Git;
- do not place secrets in Terraform outputs/state variables intended for display;
- do not place secrets in mobile configuration;
- do not print secrets in Run Command output/logs;
- prefer OCI Vault / controlled host-local secret material for later runtime credentials;
- keep rehearsal credentials distinct from future production runtime credentials.

## Known migration inventory

Current migration planning facts supplied to the platform lane:

- `46` public tables;
- `104` foreign keys;
- existing UUIDs must be preserved;
- source database is roughly `6.5 MiB`;
- storage objects are roughly `120.7 MiB`;
- target must begin empty;
- intended final strategy is a fresh full final refresh under a deliberate write freeze, not permanent dual-write/CDC as the first cutover mechanism.

These figures are planning inputs, not permission for Lane 3 to copy production data.

## Lane 4 entry conditions

Before any rehearsal load, Lane 4 should independently confirm:

1. the intended source schema/data inventory on its own branch;
2. migration ordering/extensions/functions/RLS/triggers/storage dependencies;
3. UUID-preservation behavior;
4. a non-secret method for delivering migration commands/material to Core;
5. the rehearsal target is still empty immediately before load;
6. rollback/repeatability for the rehearsal itself.

## Lane 4 exit evidence expected back to Lane 3

For infrastructure integration, Lane 3 eventually needs only non-secret evidence such as:

- rehearsal schema/data load result;
- row/object integrity checks;
- extension/function compatibility findings;
- expected database name/role names without passwords;
- API runtime connection requirements;
- Realtime/runtime PostgreSQL requirements;
- any private-network requirement that localhost-only operation cannot satisfy.

Do not return production secrets in the handoff.

## Still forbidden

- no live production cutover;
- no Supabase shutdown;
- no DNS switch;
- no public PostgreSQL;
- no public SSH;
- no Nova change;
- no Balcona change;
- no credentials in repository output;
- no unreviewed live-data mutation by Lane 3.
