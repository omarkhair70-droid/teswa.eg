-- Read-only regression contract for Supabase-native Direct Chat.
do $$
declare
  t text;
  def text;
  missing_indexes integer;
  bad_initplan_policies integer;
begin
  foreach t in array array[
    'direct_conversations','direct_messages','direct_message_attachments','direct_message_reactions','direct_typing_state'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity
    ) then
      raise exception 'Direct Chat RLS missing on %', t;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('direct_messages','direct_message_attachments','direct_message_reactions','direct_typing_state')
      and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'Direct Chat domain writes must stay RPC-owned';
  end if;

  if not exists (
    select 1 from storage.buckets where id='direct-chat-media' and public=false
  ) then
    raise exception 'direct-chat-media bucket must remain private';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname in (
        'direct_chat_media_select_participants',
        'direct_chat_media_insert_sender',
        'direct_chat_media_delete_sender'
      )
  ) <> 3 then
    raise exception 'Direct Chat storage policy set incomplete';
  end if;

  if has_function_privilege('anon','public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb)','execute')
     or not has_function_privilege('authenticated','public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb)','execute') then
    raise exception 'send_direct_native_message grants invalid';
  end if;

  if has_function_privilege('anon','public.get_direct_native_messages(uuid,integer,timestamp with time zone)','execute')
     or not has_function_privilege('authenticated','public.get_direct_native_messages(uuid,integer,timestamp with time zone)','execute') then
    raise exception 'get_direct_native_messages grants invalid';
  end if;

  if has_function_privilege('anon','public.notify_direct_message_insert_v2()','execute')
     or has_function_privilege('authenticated','public.notify_direct_message_insert_v2()','execute') then
    raise exception 'Direct Chat notification trigger helper must stay internal';
  end if;

  if has_function_privilege('anon','public.validate_direct_message_attachment_object_v2()','execute')
     or has_function_privilege('authenticated','public.validate_direct_message_attachment_object_v2()','execute') then
    raise exception 'Direct Chat attachment trigger helper must stay internal';
  end if;

  select count(*) into missing_indexes
  from (values
    ('direct_conversations_requested_by_idx'),
    ('direct_message_attachments_uploader_idx'),
    ('direct_message_reactions_user_idx'),
    ('direct_messages_deleted_by_idx'),
    ('direct_typing_state_user_idx')
  ) as expected(index_name)
  where not exists (
    select 1 from pg_indexes i
    where i.schemaname='public' and i.indexname=expected.index_name
  );
  if missing_indexes <> 0 then
    raise exception 'Direct Chat FK indexes missing: %', missing_indexes;
  end if;

  select count(*) into bad_initplan_policies
  from pg_policies
  where schemaname='public'
    and policyname in (
      'direct_conversations_select_participant',
      'direct_messages_select_participant',
      'direct_message_attachments_select_participants',
      'direct_message_reactions_select_participants',
      'direct_typing_state_select_participants'
    )
    and position('( SELECT auth.uid()' in coalesce(qual,'')) = 0;
  if bad_initplan_policies <> 0 then
    raise exception 'Direct Chat RLS auth init-plan optimization regressed: %', bad_initplan_policies;
  end if;

  select pg_get_functiondef('public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb)'::regprocedure) into def;
  if position('auth.uid()' in def)=0 or position('user_blocks' in def)=0 then
    raise exception 'Direct Chat send RPC lost auth/block enforcement';
  end if;
end
$$;

select 'direct_chat_contract_ok' as result;
