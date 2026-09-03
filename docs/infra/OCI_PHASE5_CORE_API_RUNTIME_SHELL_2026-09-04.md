# Teswa OCI Phase 5 — Core API Runtime Shell

Date: 2026-09-04  
Branch: `infra/oracle-platform-20260903`

## Purpose

Establish the first Teswa-owned API process boundary on `teswa-core-01` without production traffic, production credentials, Supabase changes, DNS changes, or live-data migration.

This is intentionally a **health-only runtime shell**. It proves the Core Podman + systemd service boundary before real OCI backend adapters are introduced.

## Safety boundary

- target: `teswa-core-01`
- service: `teswa-api.service`
- container: `teswa-api`
- listen: `127.0.0.1:3100` only
- health path: `/healthz`
- image: `docker.io/library/alpine:3.22`, pulled once during guarded apply and then started with `--pull=never`
- root filesystem: read-only
- Linux capabilities: dropped
- no production credentials
- no database writes
- no data migration
- no Supabase mutation
- no DNS mutation
- no production traffic
- no firewall port 3100 opening

The current OCI NSG design already reserves ports 3000–3999 for future Edge-to-App traffic, but this first shell remains loopback-only and therefore is not reachable from Edge yet.

## Ownership guard

The helper owns only:

- `/etc/teswa/phase5-api-shell-owned`
- `/etc/systemd/system/teswa-api.service`
- `/opt/teswa/api-shell/healthz`
- the rootful Podman container named `teswa-api`

If `teswa-api.service` already exists without the Teswa ownership marker, the helper refuses to replace it.

## Apply

From `infra/oci/terraform`:

```bash
bash -n ../inventory/apply-phase5-core-api-runtime-shell.sh

TESWA_ALLOW_CORE_API_SHELL=YES \
bash ../inventory/apply-phase5-core-api-runtime-shell.sh
```

## Expected GREEN gate

```text
run_command_state=SUCCEEDED
exit_code=0
service_active=active
service_enabled=enabled
container_running=true
listen_addresses=127.0.0.1
port=3100
health_status=ok
firewall_3100_open=false
credentials_created=false
production_traffic=false
api_runtime_shell=PASS
```

An image digest is printed as evidence of the exact image resolved by the initial pull.

## What this does not claim

This phase does not claim that the final Teswa API implementation exists yet. Lane 2 completed the Teswa-owned provider boundary but explicitly left OCI adapters and OCI runtime implementation outside that lane.

After this shell is GREEN, the next work is to replace the static health-only payload with the actual Teswa API artifact/adapters while keeping the same independently restartable service boundary, then add Realtime and Workers as separate service boundaries.
