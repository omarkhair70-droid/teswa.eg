alter table public.notifications
  add column if not exists route text null;

create index if not exists notifications_route_idx
  on public.notifications(route)
  where route is not null;
