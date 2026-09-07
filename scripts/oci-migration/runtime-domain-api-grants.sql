\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT ON public.categories TO teswa_app_authenticated;
GRANT INSERT ON public.offer_events TO teswa_app_authenticated;
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_events_created_actor_insert ON public.offer_events;
CREATE POLICY offer_events_created_actor_insert ON public.offer_events FOR INSERT TO teswa_app_authenticated
WITH CHECK (
  actor_id=teswa_runtime.current_user_id()
  AND event_type::text='created'
  AND old_status IS NULL
  AND new_status::text='pending'
  AND EXISTS(SELECT 1 FROM public.offers o WHERE o.id=offer_events.offer_id
    AND o.sender_id=teswa_runtime.current_user_id() AND o.status::text='pending')
);
COMMIT;
