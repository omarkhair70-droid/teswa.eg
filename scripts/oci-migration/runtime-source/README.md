# Oracle live runtime source

This directory is the canonicalization workspace for the Teswa Oracle Core runtime proven live on `core01` on 2026-09-10.

## Verified live snapshot

- Host sources: `/opt/teswa/domain-shadow` and `/opt/teswa/api-shell`
- Snapshot archive SHA-256: `2f1e75447b302b093a7050ca8c5aab9e31b3ac4db7e9919db79ea8c852af84d2`
- Snapshot decoded size: 44,162 bytes
- 27 tar members, including 23 Python source files
- All 23 Python files parse successfully
- No `MEDIA_TRACE`/temporary trace marker remains in the captured media or gateway runtime
- No obvious embedded private-key block, JWT, OCI OCID, or hard-coded password/secret/API-key assignment was found by the static snapshot scan
- `domain-shadow/vendor`, backups, bytecode and environment files were intentionally excluded from the snapshot

## Proven live fixes present in the snapshot

- Domain Auth resolver defaults to host Auth port `4110`
- `/v1/offers` dispatch compares the URL path so query strings no longer miss the route
- OCI media runtime loads `/app/vendor`
- OCI Object Storage client uses the explicit regional Oracle endpoint
- signed media reads allow the intended `item_video` non-owner read case while upload/delete ownership checks remain separate
- gateway policy acceptance allows encoded commas (`%2C`)
- gateway exchange GET allow-list includes the required offers/deals routes

## Canonicalization still required before cutover

The captured source is evidence/canonicalization input only; this directory is not a deployment claim. Before an Oracle production cutover:

1. Commit the extracted runtime source under this directory and pin the proven OCI Python dependency instead of relying on an untracked vendor workaround.
2. Add guarded, reviewable deployment/operator wiring for the host bind-mounted runtime directories. Do not treat generated Coolify compose files as canonical source.
3. Persist the three live Oracle DB functions through Oracle-specific migration/operator source with execute grants to `teswa_app_authenticated` rather than Supabase roles.
4. Produce one final Android preview/release candidate containing the Expo 57 picked-image persistence fix and run the final device smoke.
5. Close live email/password-recovery delivery if those flows are part of the production acceptance scope.

Supabase remains production authority until an explicit cutover decision. It should not become an automatic fallback beside Oracle; after cutover it may be retained only as a temporary cold/manual rollback until Oracle backup/restore and stability acceptance are complete.
