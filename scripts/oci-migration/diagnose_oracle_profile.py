#!/usr/bin/env python3
"""Operator-only, read-only diagnosis for the Oracle profile rehearsal.

Run on the private OCI host with TESWA_DOMAIN_DATABASE_URL configured. The
SQL refuses databases other than teswa_rehearsal before inspecting profiles.
No profile contents, credentials, SQL text, or raw database errors are printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess

from oracle_domain_read import valid_uuid
from oracle_profiles import PROFILE_JSON

SQLSTATE = re.compile(r'(?m)^(?:ERROR|FATAL|PANIC):\s*([0-9A-Z]{5})(?:\s|$)')
PROFILE_COLUMNS = (
    'id', 'display_name', 'username', 'bio', 'avatar_url', 'cover_url',
    'city', 'area', 'profile_tagline', 'successful_swaps_count',
    'response_rate', 'created_at', 'is_banned',
)


def diagnostic_sql(user_id):
    user_id = valid_uuid(user_id)
    columns = ','.join("'%s'" % column for column in PROFILE_COLUMNS)
    return """BEGIN READ ONLY;
SET LOCAL ROLE teswa_app_authenticated;
DO $$ BEGIN
  IF current_database() <> 'teswa_rehearsal' THEN
    RAISE EXCEPTION 'rehearsal_database_required';
  END IF;
END $$;
SELECT set_config('teswa.user_id','%s',true);
SELECT json_build_object(
  'database',current_database(),
  'role',current_user,
  'rlsActive',row_security_active('public.profiles'::regclass),
  'tableSelect',has_table_privilege(current_user,'public.profiles','SELECT'),
  'missingColumns',(SELECT coalesce(json_agg(c.name),'[]'::json) FROM
    unnest(ARRAY[%s]) AS c(name) WHERE NOT EXISTS
    (SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid='public.profiles'::regclass AND a.attname=c.name
       AND a.attnum>0 AND NOT a.attisdropped)))::text;
SELECT CASE WHEN (SELECT %s FROM public.profiles p WHERE p.id='%s'::uuid
  AND (p.id='%s'::uuid OR coalesce(p.is_banned,false)=false)) IS NULL
  THEN 'false' ELSE 'true' END;
ROLLBACK;""" % (user_id, columns, PROFILE_JSON, user_id, user_id)


def run(user_id, database_url=None, psql='/usr/pgsql-17/bin/psql', execute=subprocess.run):
    database_url = database_url or os.environ.get('TESWA_DOMAIN_DATABASE_URL')
    if not database_url:
        return {'ok': False, 'error': 'domain_database_not_configured'}
    sql = diagnostic_sql(user_id)
    env = {**os.environ, 'PGOPTIONS': '-c statement_timeout=5000 -c lock_timeout=1000 -c row_security=on'}
    try:
        proc = execute([psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                        '-v', 'VERBOSITY=sqlstate', '-d', database_url],
                       input=sql, text=True, capture_output=True,
                       timeout=8, env=env, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return {'ok': False, 'error': 'query_unavailable'}
    if proc.returncode:
        match = SQLSTATE.search(proc.stderr or '')
        return {'ok': False, 'sqlstate': match.group(1) if match else 'unknown'}
    lines = proc.stdout.strip().splitlines()
    if len(lines) != 3:
        return {'ok': False, 'error': 'unexpected_response'}
    try:
        metadata = json.loads(lines[1])
        profile_found = lines[2] == 'true'
        if not isinstance(metadata, dict) or lines[2] not in ('true', 'false'):
            raise ValueError('invalid_response')
    except (ValueError, TypeError):
        return {'ok': False, 'error': 'invalid_response'}
    if metadata.get('database') != 'teswa_rehearsal':
        return {'ok': False, 'error': 'rehearsal_database_required'}
    return {'ok': True, 'database': metadata.get('database'),
            'role': metadata.get('role'), 'rlsActive': metadata.get('rlsActive'),
            'tableSelect': metadata.get('tableSelect'),
            'missingColumns': metadata.get('missingColumns'),
            'profileFound': profile_found}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user-id', required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.user_id), sort_keys=True))


if __name__ == '__main__':
    main()
