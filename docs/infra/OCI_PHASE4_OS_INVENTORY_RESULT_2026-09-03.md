# Teswa OCI Phase 4 OS Inventory Result — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** CLOSED / GREEN

## Live guest truth

| Host | OS | Arch | CPU | Guest RAM | Swap | Root free | SELinux | firewalld |
|---|---|---|---:|---:|---:|---:|---|---|
| teswa-core-01 | Oracle Linux 9.8 | aarch64 | 1 | ~5.5 GiB | 4 GiB | ~20 GiB | Enforcing | active/enabled |
| teswa-edge-01 | Oracle Linux 9.8 | x86_64 | 2 logical | ~498 MiB | ~497 MiB | ~25 GiB | Enforcing | active/enabled |

Both Run Command inventory executions completed with exit code 0.

## Runtime decisions from the inventory

1. Edge is a minimal native reverse-proxy host. Do not place Podman, Docker, Node, PostgreSQL, API, Realtime, or Workers there.
2. Core is the stateful/application host.
3. PostgreSQL 17 will be installed natively on Core and initially listen on localhost only.
4. API, Realtime, and Workers will use separate restart/process boundaries on Core.
5. Podman is a Core-only prerequisite for the application-service boundary.
6. The Edge sizing decision follows the live ~498 MiB guest-memory result rather than assuming the shape-level memory is fully available to userspace.

## Lane 4 handoff target

Lane 4 requires:

- PostgreSQL major version 17;
- port 5432;
- no wildcard/public listen address;
- empty public schema;
- read-only preflight before data load.

The planned Core PostgreSQL target is designed to meet that contract.

No production data, DNS, Supabase authority, or application routing is changed by this result.
