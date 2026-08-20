alter table public.items
  add column if not exists is_seed boolean not null default false,
  add column if not exists seed_batch text,
  add column if not exists is_tradeable boolean not null default true;

create index if not exists idx_items_seed_batch on public.items(seed_batch) where is_seed = true;