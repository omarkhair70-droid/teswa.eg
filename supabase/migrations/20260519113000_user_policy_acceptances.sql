create table if not exists public.user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_key text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  constraint user_policy_acceptances_policy_key_check
    check (policy_key in ('terms_of_use', 'community_guidelines')),
  constraint user_policy_acceptances_user_policy_version_key
    unique (user_id, policy_key, policy_version)
);

create index if not exists idx_user_policy_acceptances_user_id
  on public.user_policy_acceptances (user_id);

create index if not exists idx_user_policy_acceptances_user_policy_version
  on public.user_policy_acceptances (user_id, policy_key, policy_version);

alter table public.user_policy_acceptances enable row level security;

create policy "Users can read own policy acceptances"
  on public.user_policy_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own policy acceptances"
  on public.user_policy_acceptances
  for insert
  to authenticated
  with check (auth.uid() = user_id);
