-- Keep analytics_events inaccessible through direct client table APIs.
-- The authenticated analytics RPC is the only application write surface.
revoke all on table public.analytics_events from anon;
revoke all on table public.analytics_events from authenticated;
