# Teswa OCI Phase 5 — Core API Runtime Shell

Date: 2026-09-04  
Branch: `infra/oracle-platform-20260903`

## Status

**GREEN — runtime verified on `teswa-core-01`.**

The final guarded apply returned:

```text
run_command_state=SUCCEEDED
exit_code=0
service_active=active
service_enabled=enabled
container_running=true
listen_addresses=127.0.0.1
port=3100
health_status=ok
image_digest=sha256:e07618c94aecfbf03999290c5732c3b06d0c51982daad2e0d528632b63a60452
firewall_3100_open=false
credentials_created=false
production_traffic=false
```

Because the helper exits non-zero on any failed postcondition, `exit_code=0` is the authoritative PASS gate even if OCI truncates the final output line in the terminal.

## Purpose

Establish the first Teswa-owned API process boundary on `teswa-core-01` without production traffic, production credentials, Supabase changes, DNS changes, or live-data migration.

This is intentionally a **health-only runtime shell**. It proves the Core Podman + systemd service boundary before real OCI backend adapters are introduced.

## Safety boundary

- target: `teswa-core-01`
- service: `teswa-api.service`
- container: `teswa-api`
- listen: `127.0.0.1:3100` only
- health path: `/healthz`
- image: `docker.io/library/python:3.13-alpine`, pulled during guarded apply and then started with `--pull=never`
- root filesystem: read-only
- Linux capabilities: dropped
- no production credentials
- no database writes
- no data migration
- no Supabase mutation
- no DNS mutation
- no production traffic
- no firewall port 3100 opening

The current OCI NSG design already reserves ports 3000–3999 for future Edge-to-App traffic, but this shell remains loopback-only and therefore is not reachable from Edge yet.

## Failure found and fixed

The first runtime attempt used Alpine BusyBox HTTPD and the container exited with status `127`, leaving `teswa-api.service` in auto-restart and no listener on 3100.

The helper was corrected to use Python's built-in HTTP server and a bounded readiness poll. The rerun then passed every runtime, listener, health, firewall, and production-isolation gate.

## Ownership guard

The helper owns only:

- `/etc/teswa/phase5-api-shell-owned`
- `/etc/systemd/system/teswa-api.service`
- `/opt/teswa/api-shell/healthz`
- the rootful Podman container named `teswa-api`

If `teswa-api.service` already exists without the Teswa ownership marker, the helper refuses to replace it.

## Apply

From the Lane 3 worktree root:

```bash
bash -n infra/oci/inventory/apply-phase5-core-api-runtime-shell.sh

TESWA_ALLOW_CORE_API_SHELL=YES \
bash infra/oci/inventory/apply-phase5-core-api-runtime-shell.sh
```

## GREEN gate

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

## What this does not claim

This phase does not claim that the final Teswa API implementation exists yet. Lane 2 completed the Teswa-owned provider boundary but explicitly left OCI adapters and OCI runtime implementation outside that lane.

The next Lane 3 infrastructure step is to establish Realtime and Worker process boundaries independently while Lane 4 continues PostgreSQL rehearsal work. The health-only API shell will later be replaced by the actual Teswa API artifact/adapters without changing the ownership or restart boundary.
