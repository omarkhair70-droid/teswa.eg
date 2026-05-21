alter type public.notification_type add value if not exists 'reminder_offer_response_needed';
alter type public.notification_type add value if not exists 'reminder_deal_coordination_needed';
alter type public.notification_type add value if not exists 'reminder_deal_confirmation_pending';
alter type public.notification_type add value if not exists 'reminder_unread_deal_message';
alter type public.notification_type add value if not exists 'reminder_unread_contextual_message';
alter type public.notification_type add value if not exists 'nudge_listing_refresh_or_media';
