# Oracle Exchange read continuation

This lane continues the tested integration at 107f2d529a5a8c7226456bf9428cbe890e882e15. Complete the remaining offer/deal read contracts using the existing PostgreSQL schema and RLS. Preserve the Supabase production runtime. No production data mutation, deployment, or provider cutover is part of this lane.

Acceptance: authenticated participant-scoped inbox, unread counts, confirmation IDs, review existence, and message counts; exact client contract shapes; bounded pagination; negative authorization and malformed-input tests; green Python/Node/typecheck CI. Actual OCI rehearsal and full provider composition remain separate gates.
