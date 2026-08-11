alter table public.dolab_items
  add column if not exists exchange_intent text;

comment on column public.dolab_items.exchange_intent is
  'Optional swap intent captured while preparing an item inside Dolab.';
