\set ON_ERROR_STOP on

DO $$
declare
  v_count integer;
  v_bad integer;
  v_policy_count integer;
  v_policy_bad integer;
  v_code text;
  v_a uuid;
  v_b uuid;
  v_following boolean;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'follow_user','unfollow_user','get_user_block_state','get_user_follow_state',
    'get_my_badges','get_my_trust_metrics','is_admin_user','refresh_my_badges',
    'report_user','report_story','report_direct_message'
  );
  if v_count <> 11 then raise exception 'expected 11 social/trust functions, found %',v_count; end if;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'follow_user','unfollow_user','get_user_block_state','get_user_follow_state',
    'get_my_badges','get_my_trust_metrics','is_admin_user','refresh_my_badges',
    'report_user','report_story','report_direct_message'
  ) and pg_get_functiondef(p.oid) like '%auth.uid()%';
  if v_bad <> 0 then raise exception 'auth.uid remains in % social/trust functions',v_bad; end if;

  select count(*) into v_policy_count
  from pg_policies where schemaname='public' and policyname in (
    'user_follows_select_authenticated','user_follows_insert_own','user_follows_delete_own',
    'user_blocks_select_own','user_blocks_insert_own','user_blocks_delete_own',
    'admin_users_self_select','reports_admin_select','reports_admin_update','reports_insert_own',
    'reports_select_own','reports_self_insert','reports_self_select','reports_update_admin',
    'stories_select_active_authenticated','stories_insert_own_authenticated','stories_delete_own_authenticated',
    'story_likes_delete_own','story_likes_insert_authenticated_non_owner','story_likes_select_liker_or_story_owner',
    'story_views_insert_authenticated_non_owner','story_views_select_story_owner'
  );
  if v_policy_count <> 22 then raise exception 'expected 22 social/trust policies, found %',v_policy_count; end if;

  select count(*) into v_policy_bad from pg_policies
  where schemaname='public' and tablename in ('user_follows','user_blocks','admin_users','reports','stories','story_likes','story_views')
    and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%');
  if v_policy_bad <> 0 then raise exception 'auth.uid remains in % social/trust policies',v_policy_bad; end if;

  select code into v_code from public.follow_user(null) limit 1;
  if v_code <> 'unauthorized' then raise exception 'unauth follow guard failed: %',coalesce(v_code,'null'); end if;
end$$;

BEGIN;
DO $$
declare
  v_a uuid;
  v_b uuid;
  v_code text;
  v_following boolean;
begin
  select id into v_a from teswa_identity.users order by id limit 1;
  select id into v_b from teswa_identity.users where id<>v_a order by id limit 1;
  if v_a is null or v_b is null then raise exception 'need two identity users'; end if;

  delete from public.user_follows where follower_id=v_a and followed_id=v_b;
  delete from public.user_blocks where (blocker_id=v_a and blocked_user_id=v_b) or (blocker_id=v_b and blocked_user_id=v_a);
  perform set_config('teswa.user_id',v_a::text,true);

  select code into v_code from public.follow_user(v_b) limit 1;
  if v_code <> 'followed' then raise exception 'follow semantic failed: %',coalesce(v_code,'null'); end if;
  if not exists(select 1 from public.user_follows where follower_id=v_a and followed_id=v_b) then raise exception 'follow row missing'; end if;

  select following_by_me into v_following from public.get_user_follow_state(v_b) limit 1;
  if coalesce(v_following,false) is not true then raise exception 'follow state semantic failed'; end if;

  select code into v_code from public.unfollow_user(v_b) limit 1;
  if v_code <> 'unfollowed' then raise exception 'unfollow semantic failed: %',coalesce(v_code,'null'); end if;
  if exists(select 1 from public.user_follows where follower_id=v_a and followed_id=v_b) then raise exception 'unfollow row remains'; end if;
end$$;
ROLLBACK;

SELECT CASE WHEN teswa_runtime.current_user_id() IS NULL THEN 'social_transaction_identity_cleanup=PASS' ELSE 'social_transaction_identity_cleanup=FAIL' END;
SELECT 'runtime_social_trust_core=PASS' AS result;
