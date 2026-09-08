\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT ON public.categories,public.profiles,public.items,public.item_images,public.item_videos,
  public.item_wanted_tags,public.offers,public.offer_events,public.swap_deals,public.deal_messages,
  public.deal_message_reads,public.deal_confirmations,public.reviews,public.user_blocks,
  public.notifications,public.item_likes TO teswa_app_authenticated;
GRANT SELECT ON public.direct_conversations,public.direct_messages,public.direct_message_attachments,
  public.direct_message_reactions,public.direct_typing_state TO teswa_app_authenticated;
GRANT INSERT,UPDATE ON public.items,public.profiles TO teswa_app_authenticated;
GRANT INSERT,DELETE ON public.user_blocks TO teswa_app_authenticated;
GRANT INSERT,DELETE ON public.item_likes TO teswa_app_authenticated;
GRANT UPDATE ON public.notifications TO teswa_app_authenticated;
GRANT INSERT,UPDATE,DELETE ON public.item_images,public.item_videos,public.item_wanted_tags TO teswa_app_authenticated;
GRANT INSERT ON public.offers,public.offer_events,public.deal_messages,public.deal_confirmations TO teswa_app_authenticated;
GRANT INSERT ON public.reviews TO teswa_app_authenticated;
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.follow_user(uuid)','public.unfollow_user(uuid)','public.get_user_follow_state(uuid)',
    'public.get_profile_followers(uuid,integer)','public.get_profile_following(uuid,integer)',
    'public.get_user_block_state(uuid)','public.get_user_trust_metrics(uuid)',
    'public.get_user_badges(uuid)','public.refresh_my_badges()',
    'public.archive_owned_listing_if_safe(uuid)',
    'public.reactivate_owned_archived_listing(uuid)',
    'public.delete_owned_archived_listing_if_safe(uuid)',
    'public.get_my_notification_preferences()',
    'public.update_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text)',
    'public.set_my_notification_timezone(text)','public.register_push_device(text,text)',
    'public.disable_my_push_device(text)','public.create_notification(uuid,text,text,text,uuid,uuid,uuid,uuid)',
    'public.get_direct_conversation(uuid)','public.get_my_direct_conversations()',
    'public.get_direct_conversation_messages(uuid)','public.get_direct_native_messages(uuid,integer,timestamptz)',
    'public.start_or_get_direct_conversation(uuid)','public.start_direct_conversation_with_message(uuid,text)',
    'public.send_direct_message(uuid,text)','public.send_direct_voice_message(uuid,text,text,integer,text,bigint)',
    'public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb)',
    'public.accept_direct_message_request(uuid)','public.ignore_direct_message_request(uuid)',
    'public.mark_direct_conversation_read_v2(uuid)','public.toggle_direct_message_reaction_v2(uuid,text)',
    'public.set_direct_typing_state_v2(uuid,boolean)','public.delete_direct_message_v2(uuid)'
  ] LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO teswa_app_authenticated',signature);
    END IF;
  END LOOP;
END $$;
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
