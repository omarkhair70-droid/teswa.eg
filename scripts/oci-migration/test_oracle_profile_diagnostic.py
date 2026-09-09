import importlib.util
import json
import sys
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('profile_diagnostic', Path(__file__).with_name('diagnose_oracle_profile.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
UID = '11111111-1111-4111-8111-111111111111'


class ProfileDiagnosticTests(unittest.TestCase):
    def test_sql_is_rehearsal_only_and_uses_restricted_identity(self):
        sql = module.diagnostic_sql(UID)
        self.assertIn('BEGIN READ ONLY', sql)
        self.assertIn("current_database() <> 'teswa_rehearsal'", sql)
        self.assertIn('SET LOCAL ROLE teswa_app_authenticated', sql)
        self.assertIn("set_config('teswa.user_id'", sql)
        self.assertIn('row_security_active', sql)
        self.assertIn('PROFILE', module.__name__.upper())
        self.assertIn('ROLLBACK;', sql)
        with self.assertRaises(Exception):
            module.diagnostic_sql("invalid'); DROP TABLE profiles;--")

    def test_success_reports_no_profile_contents(self):
        metadata = {'database': 'teswa_rehearsal', 'role': 'teswa_app_authenticated',
                    'rlsActive': True, 'tableSelect': True, 'missingColumns': []}
        output = UID + '\n' + json.dumps(metadata) + '\ntrue\n'
        calls = []
        def execute(*args, **kwargs):
            calls.append((args, kwargs))
            return types.SimpleNamespace(returncode=0, stdout=output, stderr='')
        result = module.run(UID, database_url='dbname=teswa_rehearsal', execute=execute)
        self.assertTrue(result['ok'])
        self.assertTrue(result['profileFound'])
        self.assertNotIn(UID, json.dumps(result))
        self.assertIn('VERBOSITY=sqlstate', calls[0][0][0])
        self.assertTrue(calls[0][1]['capture_output'])
        self.assertEqual(calls[0][1]['timeout'], 8)

    def test_absent_profile_is_not_a_query_failure(self):
        metadata = {'database': 'teswa_rehearsal', 'role': 'teswa_app_authenticated',
                    'rlsActive': True, 'tableSelect': True, 'missingColumns': []}
        output = UID + '\n' + json.dumps(metadata) + '\nfalse\n'
        result = module.run(UID, 'dbname=teswa_rehearsal', execute=lambda *a, **k:
                            types.SimpleNamespace(returncode=0, stdout=output, stderr=''))
        self.assertTrue(result['ok'])
        self.assertFalse(result['profileFound'])

    def test_sqlstate_is_reported_without_raw_errors(self):
        secret = 'postgresql://user:password@private-host/teswa_rehearsal'
        error = 'ERROR: 42703\nDETAIL: private data ' + secret
        result = module.run(UID, 'dbname=teswa_rehearsal', execute=lambda *a, **k:
                            types.SimpleNamespace(returncode=3, stdout='', stderr=error))
        self.assertEqual(result, {'ok': False, 'sqlstate': '42703'})
        self.assertNotIn(secret, json.dumps(result))
        result = module.run(UID, 'dbname=teswa_rehearsal', execute=lambda *a, **k:
                            types.SimpleNamespace(returncode=3, stdout='', stderr='ERROR: unknown'))
        self.assertEqual(result['sqlstate'], 'unknown')

    def test_no_configuration_or_malformed_output_is_not_success(self):
        with patch.dict(module.os.environ, {}, clear=True):
            self.assertEqual(module.run(UID, execute=lambda *a, **k: self.fail('executed'))['error'],
                             'domain_database_not_configured')
        result = module.run(UID, 'dbname=teswa_rehearsal', execute=lambda *a, **k:
                            types.SimpleNamespace(returncode=0, stdout='bad', stderr=''))
        self.assertFalse(result['ok'])

    def test_wrong_database_response_is_rejected(self):
        metadata = {'database': 'production', 'role': 'teswa_app_authenticated'}
        output = UID + '\n' + json.dumps(metadata) + '\ntrue\n'
        result = module.run(UID, 'dbname=teswa_rehearsal', execute=lambda *a, **k:
                            types.SimpleNamespace(returncode=0, stdout=output, stderr=''))
        self.assertEqual(result, {'ok': False, 'error': 'rehearsal_database_required'})


if __name__ == '__main__':
    unittest.main()
