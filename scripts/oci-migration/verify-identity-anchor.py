#!/usr/bin/env python3
"""Read back the OCI identity anchor in a new read-only transaction.

Run on teswa-core-01 through the existing Run Command principal. Never emits
UUIDs or provider subject digests. No public data load/parity is repeated.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


SQL = """
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT json_build_object(
 'database',current_database(),
 'local_socket',inet_server_addr() IS NULL,
 'users',(SELECT json_agg(id::text ORDER BY id) FROM teswa_identity.users),
 'identities',(SELECT json_agg(json_build_array(provider,subject_sha256,user_id::text)
    ORDER BY provider,subject_sha256,user_id) FROM teswa_identity.external_identities),
 'foreign_keys',(SELECT json_agg(json_build_object(
    'source_table',r.relname,'constraint_name',c.conname,
    'source_columns',(SELECT json_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum),
    'target_columns',(SELECT json_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum),
    'update_action_code',c.confupdtype,'delete_action_code',c.confdeltype,'match_type_code',c.confmatchtype,
    'deferrable',c.condeferrable,'initially_deferred',c.condeferred,'validated',c.convalidated)
    ORDER BY r.relname,c.conname)
   FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='teswa_identity.users'::regclass),
 'forced_rls_tables',(SELECT count(*) FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='teswa_identity' AND r.relkind='r' AND r.relrowsecurity AND r.relforcerowsecurity),
 'public_schema_grants',(SELECT count(*) FROM pg_namespace n,LATERAL aclexplode(n.nspacl) a
    WHERE n.nspname='teswa_identity' AND a.grantee=0),
 'public_table_grants',(SELECT count(*) FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace,
    LATERAL aclexplode(r.relacl) a WHERE n.nspname='teswa_identity' AND a.grantee=0)
);
COMMIT;
"""


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('identity_map')
    p.add_argument('--output', required=True)
    a = p.parse_args()
    expected = json.loads(Path(a.identity_map).read_text())
    proc = subprocess.run(['sudo', '-u', 'postgres', '/usr/pgsql-17/bin/psql', '-X', '-q', '-A', '-t',
                           '-v', 'ON_ERROR_STOP=1', '-d', 'teswa_rehearsal'],
                          input=SQL, capture_output=True, text=True)
    if proc.returncode:
        raise SystemExit('Identity readback failed; inspect host PostgreSQL diagnostics privately')
    actual = json.loads(proc.stdout)
    users = sorted(expected['users'])
    identities = sorted([[r['provider'],r['subject_sha256'],r['user_id']] for r in expected['identities']])
    fks = sorted(expected['foreign_keys'], key=lambda f: (f['source_table'],f['constraint_name']))
    actual_fks = actual['foreign_keys'] or []
    gates = {
        'local_rehearsal_target': actual['database'] == 'teswa_rehearsal' and actual['local_socket'] is True,
        'uuid_set_match': actual['users'] == users and len(users) > 0,
        'provider_mapping_match': actual['identities'] == identities and len(identities) > 0,
        'identity_fk_semantics_match': [{k:v for k,v in f.items() if k != 'validated'} for f in actual_fks] == fks and len(fks) > 0,
        'identity_fks_validated': all(f['validated'] is True for f in actual_fks) and len(actual_fks) == len(fks),
        'identity_tables_forced_rls': actual['forced_rls_tables'] == 2,
        'no_public_identity_grants': actual['public_schema_grants'] == 0 and actual['public_table_grants'] == 0,
    }
    report = {'format_version': 1, 'hard_gate_pass': all(gates.values()), 'gates': gates,
              'users': len(actual['users'] or []), 'identities': len(actual['identities'] or []),
              'identity_fks': len(actual_fks), 'uuid_set_sha256': digest(actual['users']),
              'provider_mapping_sha256': digest(actual['identities']),
              'database_mutation': False, 'identifiers_emitted': False, 'auth_runtime_verified': False}
    Path(a.output).write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['hard_gate_pass'] else 2)


if __name__ == '__main__':
    main()
