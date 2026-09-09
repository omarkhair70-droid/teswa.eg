# Teswa Oracle domain continuation — 2026-09-08

Branch: `integration/oracle-domain-closure-20260907`

## Verified

- OCI run `domain-read-20260908T125347Z` at `0f159c1` passed authenticated Login, listing publish/read, Offer, Deal, text message, OCI voice upload, recipient signed playback, database RLS, and `NOBYPASSRLS` service-role checks.
- The run remained rehearsal-only: `production_traffic=false`; Supabase production authority and DNS were unchanged.
- GitHub Oracle contract CI passed through `fdfa818`; subsequent CI must be read from the branch head.

## Code complete, awaiting the current OCI batch result

- Profile core and social API/adapters: `e198720`.
- Notifications API/adapters: `d79c53d`.
- Marketplace categories, mine, likes, exchange summaries, and publish completion writes: `84cb844`.
- Deal reviews API/adapters: `4502f17`.
- Expanded OCI journey for profile and notification proof: `5e1a7e4`.
- Conditional grants for RPC parity differences: `8663457`.

Current OCI run: `domain-read-20260908T133218Z`; last observed state was `ACCEPTED/ACKED`.

## Remaining

- Read the result of the current OCI run and fix only its concrete failure, if any.
- Complete the remaining Marketplace lifecycle/edit/discovery/video methods.
- Implement direct/contextual messaging, realtime, stories, discovery, Dolab, moderation, policies, analytics, account deletion, and workers without Supabase session mixing.
- Compose the complete Oracle runtime only after every required capability is real; then run device/app E2E for all primary routes.
- Public HTTPS, confirmation email, and final delta/parity/rollback readiness remain prerequisites. Production DNS/cutover and Supabase retirement require explicit user approval.
