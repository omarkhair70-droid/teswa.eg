import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('profiles', ROOT / 'oracle_profiles.py')
PROFILES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROFILES)
UID = '11111111-1111-4111-8111-111111111111'


class Auth:
    def resolve(self, value):
        return UID


class DB:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def query(self, user, sql):
        self.calls.append((user, sql))
        return self.result


class ProfileAclContractTests(unittest.TestCase):
    def test_private_profile_read_uses_identity_bound_function(self):
        reads = DB({'value': 'followers_only'})
        result = PROFILES.ProfilesApi(Auth(), reads, DB({})).handle(
            'GET', '/v1/profiles/privacy', 'Bearer test'
        )
        self.assertEqual(result, (200, {'value': 'followers_only'}))
        self.assertIn('teswa_runtime.get_my_direct_message_privacy()', reads.calls[0][1])
        self.assertNotIn('.direct_message_privacy', reads.calls[0][1])

    def test_profile_update_returns_only_public_projection(self):
        writes = DB({'id': UID, 'displayName': 'Omar'})
        body = {
            'userId': UID, 'displayName': 'Omar', 'username': 'omar_70',
            'profileTagline': None, 'bio': None, 'city': 'Cairo', 'area': None,
        }
        PROFILES.ProfilesApi(Auth(), DB({}), writes).handle(
            'POST', '/v1/profiles/update', 'Bearer test', body
        )
        self.assertNotIn('RETURNING *', writes.calls[0][1])
        self.assertIn('RETURNING id,display_name,username,bio', writes.calls[0][1])

    def test_grants_revoke_table_wide_profile_access(self):
        grants = (ROOT / 'runtime-domain-api-grants.sql').read_text()
        sql = (ROOT / 'runtime-profile-column-security.sql').read_text()
        self.assertIn('REVOKE SELECT,INSERT,UPDATE ON public.profiles', sql)
        self.assertNotIn('GRANT SELECT ON public.categories,public.profiles', grants)
        self.assertIn('GRANT SELECT(id,display_name,username,bio', sql)
        self.assertIn('REVOKE ALL ON FUNCTION teswa_runtime.get_my_direct_message_privacy() FROM PUBLIC', sql)
        self.assertIn('SECURITY DEFINER', sql)


if __name__ == '__main__':
    unittest.main()
