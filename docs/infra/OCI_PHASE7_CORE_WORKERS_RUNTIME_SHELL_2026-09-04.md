# Teswa OCI Phase 7 — Core Workers Runtime Shell

Date: 2026-09-04  
Branch: `infra/oracle-platform-20260903`

## Status

GREEN.

Runtime proof from `teswa-core-01`:

```text
guest_script_bytes=3219
run_command_state=ACCEPTED
run_command_state=SUCCEEDED
exit_code=0
run_as_user=ocarun
service_active=active
service_enabled=enabled
container_running=true
network_mode=none
listener=none
ready_marker=teswa-workers-ready
```

The command exited 0 only after validating the workers systemd unit, running Podman container, ready marker, and absence of a workers listener.

## Boundary

This phase establishes only the independently restartable Workers process boundary:

- service: `teswa-workers.service`
- container: `teswa-workers`
- network mode: `none`
- listener: none
- no database credentials
- no Supabase changes
- no data migration
- no DNS change
- no production traffic

It does not claim that final Teswa background-job implementations exist yet.

## Core runtime sequence now green

1. PostgreSQL 17 — localhost-only
2. API runtime shell — `127.0.0.1:3100`
3. Realtime runtime shell — `127.0.0.1:3200`, websocket implementation not claimed
4. Workers runtime shell — no listener

Next Lane 3 step: preflight and bootstrap native Caddy on `teswa-edge-01`, still without production DNS cutover or production traffic.
