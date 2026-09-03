# Supabase adapter lane

This directory is the only future backend-adapter area that may intentionally know Supabase.

Current status: **architecture scaffold only**. No runtime composition root has been switched and no existing Teswa feature uses these adapters yet.

Rules:

1. Contracts under `lib/backend/contracts` must never import `@supabase/supabase-js`, table names, RPC names, storage bucket names, or Realtime channel syntax.
2. Supabase adapters map provider payloads/errors into Teswa-owned contract types.
3. Existing production services remain authoritative until one domain migration is validated end-to-end.
4. Migrate one domain at a time; do not create a generic `query(tableName)` facade because that only renames provider coupling.
5. The eventual runtime composition root must be the only place that chooses the active backend provider.
6. OCI adapters must implement the same Teswa contracts before any production cutover.
7. No domain is considered decoupled until screens/features no longer import Supabase directly and provider types no longer leak through public signatures.

See:
- `docs/TESWA_BACKEND_DECOUPLING_INVENTORY_2026-09-03.md`
- `docs/TESWA_BACKEND_BOUNDARY_ARCHITECTURE_2026-09-03.md`
