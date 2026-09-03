-- Teswa Supabase -> OCI source inventory
-- Date: 2026-09-03
-- READ-ONLY AUDIT SCRIPT.
-- This file contains SELECT statements only. Do not add DDL/DML or destructive
-- operations. Run against the current source authority to regenerate the
-- migration/shadow verification inventory.

-- 1) Applied migration history.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- 2) Public tables/views and RLS state.
select c.relkind,
       n.nspname as schema_name,
       c.relname as object_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm')
order by c.relkind, c.relname;

-- 3) Public enum values.
select t.typname as enum_name,
       e.enumsortorder,
       e.enumlabel
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
order by t.typname, e.enumsortorder;

-- 4) Index definitions.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 5) Constraints.
select c.relname as table_name,
       con.conname as constraint_name,
       con.contype as constraint_type,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;

-- 6) Public function signatures, security mode and grants.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) ilike '%auth.uid()%' as uses_auth_uid,
       pg_get_functiondef(p.oid) ilike '%auth.jwt()%' as uses_auth_jwt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;

-- 7) Public trigger inventory.
select c.relname as table_name,
       t.tgname as trigger_name,
       pn.nspname as function_schema,
       p.proname as function_name,
       pg_get_triggerdef(t.oid, true) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 8) Auth user trigger needed for profile bootstrap.
select n.nspname as schema_name,
       c.relname as table_name,
       t.tgname as trigger_name,
       pn.nspname as function_schema,
       p.proname as function_name,
       pg_get_triggerdef(t.oid, true) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
order by t.tgname;

-- 9) RLS policies. Treat policy expressions as part of the authorization contract.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 10) RLS-enabled public tables with no direct table policies.
select n.nspname as schema_name,
       c.relname as table_name,
       count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity
group by n.nspname, c.relname
having count(p.policyname) = 0
order by c.relname;

-- 11) Direct public FK dependencies on auth.users.
select con.conname,
       c.relname as table_name,
       a.attname as column_name
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
where con.contype = 'f'
  and n.nspname = 'public'
  and con.confrelid = 'auth.users'::regclass
order by c.relname, con.conname, k.ord;

-- 12) Auth aggregate identity inventory. No PII is selected.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.identities) as auth_identities,
  (select count(*) from public.profiles) as profiles;

select provider, count(*) as identities
from auth.identities
group by provider
order by provider;

-- 13) Storage bucket contract and aggregate object footprint.
select b.id,
       b.name,
       b.public,
       b.file_size_limit,
       b.allowed_mime_types,
       (select count(*) from storage.objects o where o.bucket_id = b.id) as object_count,
       (select coalesce(sum((o.metadata->>'size')::bigint), 0)
          from storage.objects o
         where o.bucket_id = b.id
           and (o.metadata->>'size') ~ '^[0-9]+$') as bytes
from storage.buckets b
order by b.id;

-- 14) DB columns that may contain object keys or provider-specific URLs.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    column_name ilike '%url%'
    or column_name ilike '%path%'
    or column_name ilike '%storage%'
    or column_name ilike '%avatar%'
    or column_name ilike '%cover%'
  )
order by table_name, ordinal_position;

-- 15) Supabase Realtime publication membership.
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

-- 16) Cron metadata only. Deliberately does not return commands or secrets.
select jobid, schedule, database, username, active
from cron.job
order by jobid;

-- 17) Installed extensions.
select e.extname,
       e.extversion,
       n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by e.extname;

-- 18) Compact migration gate counters.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')) as public_tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v') as public_views,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) as public_tables_without_rls,
  (select count(*) from pg_indexes where schemaname='public') as public_indexes,
  (select count(*) from pg_constraint con join pg_namespace n on n.oid=con.connamespace
    where n.nspname='public') as public_constraints,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public') as public_functions,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef) as public_security_definer_functions,
  (select count(*) from pg_policies where schemaname='public') as public_policies,
  (select count(*) from pg_policies where schemaname='storage') as storage_policies,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal) as public_user_triggers,
  (select count(*) from storage.objects) as storage_objects,
  (select count(*) from supabase_migrations.schema_migrations) as migration_rows;
