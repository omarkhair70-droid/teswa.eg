create table public.contextual_conversations (
  id uuid primary key default gen_random_uuid(),
  context_type text not null,
  context_entity_id uuid not null,
  starter_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contextual_conversations_context_type_check
    check (context_type in ('story_reply')),
  constraint contextual_conversations_starter_recipient_diff_check
    check (starter_id <> recipient_id),
  constraint contextual_conversations_context_unique
    unique (context_type, context_entity_id, starter_id)
);

create index contextual_conversations_starter_created_at_idx
  on public.contextual_conversations (starter_id, created_at desc);
create index contextual_conversations_recipient_created_at_idx
  on public.contextual_conversations (recipient_id, created_at desc);
create index contextual_conversations_context_lookup_idx
  on public.contextual_conversations (context_type, context_entity_id);

create table public.contextual_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.contextual_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint contextual_messages_body_not_blank_check
    check (char_length(btrim(body)) > 0),
  constraint contextual_messages_body_max_len_check
    check (char_length(body) <= 800)
);

create index contextual_messages_conversation_created_at_idx
  on public.contextual_messages (conversation_id, created_at asc);
create index contextual_messages_sender_created_at_idx
  on public.contextual_messages (sender_id, created_at desc);

create table public.contextual_message_reads (
  conversation_id uuid not null references public.contextual_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index contextual_message_reads_user_last_read_at_idx
  on public.contextual_message_reads (user_id, last_read_at desc);

alter table public.contextual_conversations enable row level security;
alter table public.contextual_messages enable row level security;
alter table public.contextual_message_reads enable row level security;

create policy contextual_conversations_select_participants
  on public.contextual_conversations
  for select
  to authenticated
  using (starter_id = auth.uid() or recipient_id = auth.uid());

create policy contextual_messages_select_conversation_participants
  on public.contextual_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contextual_conversations c
      where c.id = contextual_messages.conversation_id
        and (c.starter_id = auth.uid() or c.recipient_id = auth.uid())
    )
  );

create policy contextual_messages_insert_conversation_participants
  on public.contextual_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.contextual_conversations c
      where c.id = contextual_messages.conversation_id
        and (c.starter_id = auth.uid() or c.recipient_id = auth.uid())
    )
  );

create policy contextual_message_reads_select_self_participant
  on public.contextual_message_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.contextual_conversations c
      where c.id = contextual_message_reads.conversation_id
        and (c.starter_id = auth.uid() or c.recipient_id = auth.uid())
    )
  );

create or replace function public.mark_contextual_thread_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.contextual_conversations c
    where c.id = p_conversation_id
      and (c.starter_id = v_user_id or c.recipient_id = v_user_id)
  ) then
    return;
  end if;

  insert into public.contextual_message_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, v_user_id, now())
  on conflict (conversation_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.mark_contextual_thread_read(uuid) from public;
grant execute on function public.mark_contextual_thread_read(uuid) to authenticated;

create or replace function public.get_unread_contextual_messages_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from public.contextual_messages m
  join public.contextual_conversations c
    on c.id = m.conversation_id
  left join public.contextual_message_reads r
    on r.conversation_id = c.id
   and r.user_id = v_user_id
  where (c.starter_id = v_user_id or c.recipient_id = v_user_id)
    and m.sender_id <> v_user_id
    and (r.last_read_at is null or m.created_at > r.last_read_at);

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.get_unread_contextual_messages_count() from public;
grant execute on function public.get_unread_contextual_messages_count() to authenticated;
