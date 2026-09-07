\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT ON public.categories,public.profiles,public.items,public.item_images,public.item_videos,
  public.item_wanted_tags,public.offers,public.offer_events,public.swap_deals,public.deal_messages,
  public.deal_message_reads,public.deal_confirmations,public.reviews TO teswa_app_authenticated;
GRANT INSERT,UPDATE ON public.items TO teswa_app_authenticated;
GRANT INSERT,UPDATE,DELETE ON public.item_images,public.item_videos,public.item_wanted_tags TO teswa_app_authenticated;
GRANT INSERT ON public.offers,public.offer_events,public.deal_messages,public.deal_confirmations TO teswa_app_authenticated;
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
