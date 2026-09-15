import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).parent
USER_ID = '11111111-1111-4111-8111-111111111111'
PREFIX = f'/v1/policies/acceptances?userId={USER_ID}&keys='


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PolicyAcceptanceAllowlistTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gateways = (
            load('legacy_gateway', ROOT / 'auth-api-shadow-gateway.py'),
            load(
                'canonical_gateway_base',
                ROOT / 'runtime-source' / 'api-shell' / 'shadow_gateway_base.py',
            ),
        )

    def assert_allowed(self, keys):
        path = PREFIX + keys
        for gateway in self.gateways:
            with self.subTest(gateway=gateway.__name__, keys=keys):
                self.assertTrue(any(rule.fullmatch(path) for rule in gateway.DOMAIN_GET))

    def assert_blocked(self, keys):
        path = PREFIX + keys
        for gateway in self.gateways:
            with self.subTest(gateway=gateway.__name__, keys=keys):
                self.assertFalse(any(rule.fullmatch(path) for rule in gateway.DOMAIN_GET))

    def test_accepts_url_search_params_encoded_comma(self):
        self.assert_allowed('terms_of_use%2Ccommunity_guidelines')
        self.assert_allowed('terms_of_use%2ccommunity_guidelines')

    def test_keeps_literal_and_single_policy_keys_compatible(self):
        self.assert_allowed('terms_of_use,community_guidelines')
        self.assert_allowed('terms_of_use')

    def test_rejects_double_encoding_and_query_injection(self):
        self.assert_blocked('terms_of_use%252Ccommunity_guidelines')
        self.assert_blocked('terms_of_use%2Fcommunity_guidelines')
        self.assert_blocked('terms_of_use%2Ccommunity_guidelines&admin=true')


if __name__ == '__main__':
    unittest.main()
