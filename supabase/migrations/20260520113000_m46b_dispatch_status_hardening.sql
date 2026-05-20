alter table public.smart_notification_dispatches
  add column if not exists status text not null default 'sent' check (status in ('reserved','sent','failed')),
  add column if not exists notification_id uuid null references public.notifications(id) on delete set null,
  add column if not exists failure_reason text null;

create index if not exists smart_notification_dispatches_user_status_sent_idx
  on public.smart_notification_dispatches (user_id, status, sent_at desc);
