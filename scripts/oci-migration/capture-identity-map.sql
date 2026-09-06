-- Read-only, single-snapshot identity anchor. No emails, password hashes,
-- metadata, tokens, or provider subjects are emitted. This is NOT a credential
-- export and cannot, by itself, establish authentication authority.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT json_build_object(
  'format_version', 1,
  'source_project', 'nvgxjvbsyvnfdakqhswq',
  'captured_at', transaction_timestamp(),
  'credential_material_included', false,
  'users', (SELECT json_agg(id::text ORDER BY id) FROM auth.users),
  'identities', (SELECT json_agg(json_build_object(
    'user_id', user_id::text, 'provider', provider,
    'subject_sha256', encode(sha256(convert_to(provider || ':' || provider_id, 'UTF8')), 'hex')
  ) ORDER BY provider, provider_id) FROM auth.identities),
  'foreign_keys', (SELECT json_agg(json_build_object(
    'source_table', r.relname, 'constraint_name', c.conname,
    'source_columns', (SELECT json_agg(a.attname ORDER BY k.n)
      FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum),
    'target_columns', (SELECT json_agg(a.attname ORDER BY k.n)
      FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum),
    'update_action_code', c.confupdtype, 'delete_action_code', c.confdeltype,
    'match_type_code', c.confmatchtype,
    'deferrable', c.condeferrable, 'initially_deferred', c.condeferred
  ) ORDER BY r.relname,c.conname)
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='auth.users'::regclass)
) AS identity_map;
COMMIT;
