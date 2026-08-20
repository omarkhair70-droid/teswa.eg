# Teswa database contract tests

These SQL files are read-only regression assertions for production-critical database contracts. A failing assertion raises an exception and should fail CI/release validation.

Current contracts:

- `security_pr1_contract.sql` — PR #1 privileged RPC/view grants.
- `security_surface_contract.sql` — broad RLS and SECURITY DEFINER exposure guard.
- `exchange_state_contract.sql` — offer/deal state ownership and audit-log integrity.
- `direct_chat_contract.sql` — Supabase-native Direct Chat RLS, RPC and storage ownership.
- `observability_contract.sql` — analytics RPC authentication, privacy limits, performance allowlist, and RPC-only table access.

The files intentionally avoid inserting or mutating user data. PR #6 owns wiring them into automated CI against an appropriate linked/test database. Until a fresh database baseline is fully captured, they may also be run manually against production as read-only assertions.

Do not weaken a contract merely to make a failing test green. If a product requirement needs a permission change, update the server-side authorization design and the test together in the same reviewed PR.
