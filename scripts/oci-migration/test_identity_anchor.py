import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('anchor', Path(__file__).with_name('prepare-identity-anchor.py'))
anchor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anchor)
compare_spec = importlib.util.spec_from_file_location('compare', Path(__file__).with_name('compare-identity-anchors.py'))
compare = importlib.util.module_from_spec(compare_spec)
compare_spec.loader.exec_module(compare)


class AnchorTests(unittest.TestCase):
    def setUp(self):
        users = ['00000000-0000-4000-8000-000000000001']
        fk = {'source_table': 'profiles', 'constraint_name': 'profiles_id_fkey',
              'source_columns': ['id'], 'target_columns': ['id'], 'update_action_code': 'a',
              'delete_action_code': 'c', 'match_type_code': 's', 'deferrable': False,
              'initially_deferred': False}
        self.data = {'format_version': 1, 'source_project': 'nvgxjvbsyvnfdakqhswq',
                     'credential_material_included': False, 'users': users,
                     'identities': [{'user_id': users[0], 'provider': 'google', 'subject_sha256': 'a'*64}],
                     'foreign_keys': [fk]}
        self.baseline = {'provider_compat': {'auth': {'available': True, 'users': 1, 'identities': 1,
                          'user_uuid_set_sha256': anchor.digest(users), 'profile_uuid_set_sha256': anchor.digest(users),
                          'providers': [{'provider': 'google', 'identity_count': 1}]}},
                         'catalog': {'foreign_keys': [{**fk, 'target_schema': 'auth', 'target_table': 'users', 'is_deferrable': False}]}}

    def test_valid_preserves_fk_and_isolation(self):
        sql, report = anchor.compile_anchor(self.data, self.baseline)
        self.assertIn('REFERENCES teswa_identity.users(id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE', sql)
        self.assertIn('FORCE ROW LEVEL SECURITY', sql)
        self.assertIn("current_database() <> 'teswa_rehearsal'", sql)
        self.assertIn('inet_server_addr() IS NOT NULL', sql)
        self.assertFalse(report['auth_runtime_verified'])

    def test_missing_baseline(self):
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, {})

    def test_duplicate_users(self):
        self.data['users'] *= 2
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_drift(self):
        self.baseline['provider_compat']['auth']['user_uuid_set_sha256'] = 'b'*64
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_subject_collision(self):
        self.data['identities'] *= 2
        self.baseline['provider_compat']['auth']['identities'] = 2
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_orphan(self):
        self.data['identities'][0]['user_id'] = '00000000-0000-4000-8000-000000000002'
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_credentials_rejected(self):
        self.data['credential_material_included'] = True
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_unreviewed_provider(self):
        self.data['identities'][0]['provider'] = 'saml'
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_delete_semantics_drift(self):
        self.data['foreign_keys'][0]['delete_action_code'] = 'n'
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_injection_rejected(self):
        self.data['foreign_keys'][0]['source_table'] = 'profiles; DROP SCHEMA public'
        with self.assertRaises(ValueError): anchor.compile_anchor(self.data, self.baseline)

    def test_comparison_rejects_empty_or_malformed_evidence(self):
        for value in ({}, {'distinct_non_null_count': None, 'uuid_set_sha256': None},
                      {'format_version': 1, 'distinct_non_null_count': 0, 'uuid_set_sha256': 'a'*64},
                      {'format_version': 1, 'distinct_non_null_count': True, 'uuid_set_sha256': 'a'*64}):
            self.assertFalse(compare.valid_anchor(value))

    def test_comparison_accepts_capture_format(self):
        self.assertTrue(compare.valid_anchor({'format_version': 1, 'distinct_non_null_count': 32,
                         'uuid_set_sha256': 'a'*64, 'read_only': True, 'identifiers_emitted': False}))


if __name__ == '__main__':
    unittest.main()
