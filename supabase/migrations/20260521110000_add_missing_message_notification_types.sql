alter type public.notification_type
add value if not exists 'contextual_message_received';

alter type public.notification_type
add value if not exists 'deal_message_received';

alter type public.notification_type
add value if not exists 'deal_voice_message_received';
