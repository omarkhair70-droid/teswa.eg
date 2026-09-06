#!/usr/bin/env python3
"""Compile an isolated identity-anchor extension; never connects or authenticates.

Input comes from capture-identity-map.sql. The already GREEN rehearsal manifest
is required to prevent binding a different UUID set to the old public snapshot.
Generated files contain identifiers and belong outside Git.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import uuid
from pathlib import Path

IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SHA = re.compile(r"^[0-9a-f]{64}$")
ACTIONS = {'a': 'NO ACTION', 'r': 'RESTRICT', 'c': 'CASCADE',
           'n': 'SET NULL', 'd': 'SET DEFAULT'}


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def qi(value):
    if not isinstance(value, str) or not IDENT.fullmatch(value):
        raise ValueError('Invalid SQL identifier')
    return '"' + value + '"'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def compile_anchor(data, baseline):
    require(data.get('format_version') == 1, 'Unsupported identity map format')
    require(data.get('source_project') == 'nvgxjvbsyvnfdakqhswq', 'Wrong source project')
    require(data.get('credential_material_included') is False, 'Credential-bearing input refused')
    users = data.get('users')
    require(isinstance(users, list) and len(users) > 0, 'Missing users')
    require(all(isinstance(x, str) and str(uuid.UUID(x)) == x for x in users), 'Invalid UUID')
    require(len(users) == len(set(users)), 'Duplicate users')
    users = sorted(users)
    auth = baseline.get('provider_compat', {}).get('auth', {})
    require(auth.get('available') is True, 'Missing rehearsal Auth baseline')
    require(len(users) == auth.get('users'), 'Rehearsal user count drift')
    require(digest(users) == auth.get('user_uuid_set_sha256'), 'Rehearsal UUID drift')
    require(digest(users) == auth.get('profile_uuid_set_sha256'), 'Rehearsal profile UUID drift')
    identities = data.get('identities')
    require(isinstance(identities, list) and len(identities) == auth.get('identities'), 'Identity count drift')
    keys, linked, providers = set(), set(), {}
    for row in identities:
        require(set(row) == {'user_id', 'provider', 'subject_sha256'}, 'Unexpected identity fields')
        require(row['user_id'] in users, 'Orphan identity')
        require(row['provider'] in {'google', 'email'}, 'Unreviewed identity provider')
        require(isinstance(row['subject_sha256'], str) and SHA.fullmatch(row['subject_sha256']), 'Invalid subject digest')
        key = (row['provider'], row['subject_sha256'])
        require(key not in keys, 'Conflicting provider subject')
        keys.add(key)
        linked.add(row['user_id'])
        providers[row['provider']] = providers.get(row['provider'], 0) + 1
    require(linked == set(users), 'User without identity')
    require(providers == {r['provider']: r['identity_count'] for r in auth['providers']}, 'Provider count drift')
    fks = data.get('foreign_keys')
    expected = [f for f in baseline['catalog']['foreign_keys'] if f['target_schema'] == 'auth' and f['target_table'] == 'users']
    require(isinstance(fks, list) and len(fks) == len(expected) and len(fks) > 0, 'Identity FK count drift')
    expected_by_key = {(f['source_table'], f['constraint_name']): f for f in expected}
    seen = set()
    ddl = []
    for fk in fks:
        key = (fk['source_table'], fk['constraint_name'])
        require(key in expected_by_key and key not in seen, 'Unknown/duplicate FK')
        seen.add(key)
        old = expected_by_key[key]
        for field in ('source_columns', 'target_columns', 'update_action_code', 'delete_action_code', 'match_type_code'):
            require(fk[field] == old[field], 'Identity FK semantic drift: ' + field)
        require(fk['deferrable'] == old['is_deferrable'] and fk['initially_deferred'] == old['initially_deferred'], 'FK timing drift')
        require(fk['target_columns'] == ['id'] and len(fk['source_columns']) == 1, 'Unreviewed identity FK shape')
        require(fk['match_type_code'] in {'s', 'f'}, 'Unreviewed FK match type')
        match = 'FULL' if fk['match_type_code'] == 'f' else 'SIMPLE'
        timing = 'DEFERRABLE' if fk['deferrable'] else 'NOT DEFERRABLE'
        timing += ' INITIALLY DEFERRED' if fk['initially_deferred'] else ' INITIALLY IMMEDIATE'
        ddl.append(f"ALTER TABLE public.{qi(fk['source_table'])} ADD CONSTRAINT {qi(fk['constraint_name'])} "
                   f"FOREIGN KEY ({qi(fk['source_columns'][0])}) REFERENCES teswa_identity.users(id) "
                   f"MATCH {match} ON UPDATE {ACTIONS[fk['update_action_code']]} ON DELETE {ACTIONS[fk['delete_action_code']]} {timing};")
    normalized = sorted([[r['provider'], r['subject_sha256'], r['user_id']] for r in identities])
    user_values = ',\n'.join("('%s')" % x for x in users)
    identity_values = ',\n'.join("('%s','%s','%s')" % tuple(r) for r in normalized)
    expected_users = json.dumps(users, separators=(',', ':'))
    expected_identities = json.dumps(normalized, separators=(',', ':'))
    sql = f"""\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $guard$ BEGIN
  IF current_database() <> 'teswa_rehearsal' OR current_setting('server_version_num')::int / 10000 <> 17
     OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'Requires local Unix socket to PostgreSQL 17 teswa_rehearsal';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='teswa_identity') THEN
    RAISE EXCEPTION 'Identity schema exists; inspect before changing or retrying';
  END IF;
  IF (SELECT jsonb_agg(id::text ORDER BY id) FROM public.profiles) IS DISTINCT FROM '{expected_users}'::jsonb THEN
    RAISE EXCEPTION 'Target profile UUID drift';
  END IF;
END $guard$;
CREATE SCHEMA teswa_identity;
REVOKE ALL ON SCHEMA teswa_identity FROM PUBLIC;
CREATE TABLE teswa_identity.users (id uuid PRIMARY KEY);
CREATE TABLE teswa_identity.external_identities (
  provider text NOT NULL CHECK (provider IN ('google','email')),
  subject_sha256 text NOT NULL CHECK (subject_sha256 ~ '^[0-9a-f]{{64}}$'),
  user_id uuid NOT NULL REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider,subject_sha256)
);
CREATE INDEX external_identities_user_id_idx ON teswa_identity.external_identities(user_id);
REVOKE ALL ON ALL TABLES IN SCHEMA teswa_identity FROM PUBLIC;
ALTER TABLE teswa_identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teswa_identity.users FORCE ROW LEVEL SECURITY;
ALTER TABLE teswa_identity.external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE teswa_identity.external_identities FORCE ROW LEVEL SECURITY;
INSERT INTO teswa_identity.users(id) VALUES {user_values};
INSERT INTO teswa_identity.external_identities(provider,subject_sha256,user_id) VALUES {identity_values};
{chr(10).join(ddl)}
DO $verify$ BEGIN
  IF (SELECT jsonb_agg(id::text ORDER BY id) FROM teswa_identity.users) IS DISTINCT FROM '{expected_users}'::jsonb THEN
    RAISE EXCEPTION 'UUID parity failed';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(provider,subject_sha256,user_id::text) ORDER BY provider,subject_sha256,user_id)
      FROM teswa_identity.external_identities) IS DISTINCT FROM '{expected_identities}'::jsonb THEN
    RAISE EXCEPTION 'Provider subject mapping parity failed';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='teswa_identity.users'::regclass AND c.convalidated) <> {len(fks)} THEN
    RAISE EXCEPTION 'Validated identity FK count failed';
  END IF;
END $verify$;
COMMIT;
SELECT 'lane4_identity_anchor_apply=PASS';
"""
    return sql, {'format_version': 1, 'users': len(users), 'identities': len(identities),
                 'providers': providers, 'identity_fks': len(fks), 'uuid_set_sha256': digest(users),
                 'provider_mapping_sha256': digest(normalized), 'auth_runtime_verified': False,
                 'credential_material_included': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('identity_map')
    p.add_argument('--rehearsal-manifest', required=True)
    p.add_argument('--output-dir', required=True)
    a = p.parse_args()
    out = Path(a.output_dir).resolve()
    repo = next((p for p in Path(__file__).resolve().parents if (p/'.git').exists()), None)
    require(repo is None or not out.is_relative_to(repo), 'Generated identity material must stay outside Git')
    sql, report = compile_anchor(json.loads(Path(a.identity_map).read_text()), json.loads(Path(a.rehearsal_manifest).read_text()))
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    for name, value in [('apply-identity-anchor.sql', sql), ('identity-anchor-plan.json', json.dumps(report, indent=2)+'\n')]:
        path = out/name
        with open(path, 'x', encoding='utf-8', newline='\n') as f:
            os.chmod(path, 0o600)
            f.write(value)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
