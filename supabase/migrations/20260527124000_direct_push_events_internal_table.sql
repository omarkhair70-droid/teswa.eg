create table if not exists public.direct_push_events (
  id uuid primary key default gen_random_uuid(),
  stream_message_id text not null unique,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid null references public.notifications(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists direct_push_events_conversation_id_idx on public.direct_push_events(conversation_id);
create index if not exists direct_push_events_receiver_id_idx on public.direct_push_events(receiver_id);
create index if not exists direct_push_events_sender_id_idx on public.direct_push_events(sender_id);

alter table public.direct_push_events enable row level security;
revoke all on public.direct_push_events from anon, authenticated;
