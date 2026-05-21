-- Follow-up hardening: raw user_badges rows should not be directly selectable by clients.
-- Public badge display must go through SECURITY DEFINER RPCs.

drop policy if exists "user_badges_select_authenticated" on public.user_badges;
