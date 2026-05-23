drop policy if exists "item_likes_select_authenticated" on public.item_likes;
drop policy if exists "item_likes_select_readable" on public.item_likes;

create policy "item_likes_select_readable"
  on public.item_likes
  for select
  to anon, authenticated
  using (true);
