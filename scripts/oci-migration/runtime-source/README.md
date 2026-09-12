# Canonical Oracle runtime source

This directory is the repository-owned runtime for the Teswa Oracle Core services proven on `core01` during the 2026-09-10 live preview acceptance.

## Proven live snapshot

- Live bind mounts: `/opt/teswa/domain-shadow -> /app` and `/opt/teswa/api-shell -> /app`
- Snapshot archive on Core: `/home/opc/teswa-runtime-source-20260910.tar.gz`
- Snapshot SHA-256: `2f1e75447b302b093a7050ca8c5aab9e31b3ac4db7e9919db79ea8c852af84d2`
- Snapshot size: 44,162 bytes
- 27 tar members; 23 Python files; all 23 parsed successfully
- `vendor`, backups, bytecode and environment files were intentionally excluded
- Static review found no obvious embedded secret/private-key/JWT/OCI-OCID assignment

## Canonicalized live fixes

- Domain Auth resolver defaults to Auth on host port `4110`.
- Domain `/v1/offers?...` dispatch matches on URL path.
- OCI media loads `/app/vendor`, uses the explicit regional Object Storage endpoint and preserves the proven `item_video`/`deal_voice` authorization behavior.
- `requirements.txt` pins the proven OCI SDK version: `oci==2.185.2`.
- API gateway uses the live Core ports `4110` / `4130` / `4120`.
- API gateway accepts literal commas and `%2C` in policy acceptance keys.
- API gateway exposes the authenticated Offers/Deals GET surface already proven by the application.

`api-shell/shadow_gateway_base.py` is the previously reviewed gateway implementation. `api-shell/shadow_gateway.py` is the small canonical entrypoint that applies only the proven live routing deltas above, keeping those deltas explicit and reviewable instead of rewriting the gateway wholesale. `api-shell/healthz` is a compatibility/static health marker; the running gateway serves `/healthz` dynamically.

## Deployment policy

This directory is source of truth; generated Coolify compose files are not. A deployment must be guarded, must preserve environment files and the `domain-shadow/vendor` directory, must create a rollback copy first, and must not switch application authority from Supabase to Oracle as a side effect. Runtime synchronization and traffic cutover are separate operations.

Supabase remains production authority until an explicit final cutover decision.
