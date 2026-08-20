-- PR #8: Direct Chat architecture hardening.
-- Keep client-visible behavior unchanged while tightening internal helpers and query paths.

create index if not exists direct_conversations_requested_by_idx
  on public.direct_conversations(requested_by);
create index if not exists direct_message_attachments_uploader_idx
  on public.direct_message_attachments(uploader_id);
create index if not exists direct_message_reactions_user_idx
  on public.direct_message_reactions(user_id);
create index if not exists direct_messages_deleted_by_idx
  on public.direct_messages(deleted_by);
create index if not exists direct_typing_state_user_idx
  on public.direct_typing_state(user_id);

-- These functions are trigger implementation details, not public RPCs.
revoke all on function public.notify_direct_message_insert_v2() from public, anon, authenticated;
grant execute on function public.notify_direct_message_insert_v2() to service_role;
revoke all on function public.validate_direct_message_attachment_object_v2() from public, anon, authenticated;
grant execute on function public.validate_direct_message_attachment_object_v2() to service_role;

-- Preserve the existing participant-only read contract while allowing Postgres to
-- initialize auth.uid() once per statement instead of once per candidate row.
drop policy if exists direct_conversations_select_participant on public.direct_conversations;
create policy direct_conversations_select_participant
on public.direct_conversations
for select
to authenticated
using ((select auth.uid()) = participant_a or (select auth.uid()) = participant_b);

drop policy if exists direct_messages_select_participant on public.direct_messages;
create policy direct_messages_select_participant
on public.direct_messages
for select
to authenticated
using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_messages.conversation_id
      and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
  )
);

drop policy if exists direct_message_attachments_select_participants on public.direct_message_attachments;
create policy direct_message_attachments_select_participants
on public.direct_message_attachments
for select
to authenticated
using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_message_attachments.conversation_id
      and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
  )
);

drop policy if exists direct_message_reactions_select_participants on public.direct_message_reactions;
create policy direct_message_reactions_select_participants
on public.direct_message_reactions
for select
to authenticated
using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_message_reactions.conversation_id
      and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
  )
);

drop policy if exists direct_typing_state_select_participants on public.direct_typing_state;
create policy direct_typing_state_select_participants
on public.direct_typing_state
for select
to authenticated
using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_typing_state.conversation_id
      and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
  )
);
