alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_official boolean not null default false,
  add column if not exists verified_at timestamp with time zone;

comment on column public.profiles.is_verified is 'Whether the profile carries an in-app verification badge.';
comment on column public.profiles.is_official is 'Whether the profile is an official Teswa-owned account.';
comment on column public.profiles.verified_at is 'Timestamp when the profile was verified.';