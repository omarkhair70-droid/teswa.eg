import importlib.util
import unittest
from pathlib import Path

SCRIPT=Path(__file__).with_name('edge-api-rehearsal.py')
SPEC=importlib.util.spec_from_file_location('edge_api_rehearsal',SCRIPT)
MODULE=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)

class Tests(unittest.TestCase):
    def test_guest_fits_run_command_limit(self):
        value=MODULE.GUEST.replace('__HOST__',MODULE.HOST).replace('__PRIVATE__',MODULE.PRIVATE).replace('__CORE__',MODULE.CORE)
        self.assertLessEqual(len(value.encode()),4096)
        compile(value.split("<<'PY'\n",1)[1].split('\nPY\n',1)[0],'<guest>','exec')
    def test_route_is_bounded_to_v1_and_expected_core(self):
        self.assertIn('handle /v1/*',MODULE.GUEST)
        self.assertIn("reverse_proxy '+u",MODULE.GUEST)
        self.assertNotIn('handle {\n  reverse_proxy',MODULE.GUEST)
    def test_preserves_existing_8080_server_semantically(self):
        self.assertIn("canon(server(a,':8080'))!=canon(server(b,':8080'))",MODULE.GUEST)
        self.assertNotIn('caddy reload',MODULE.GUEST)
        self.assertGreaterEqual(MODULE.GUEST.count('systemctl restart caddy'),2)
        self.assertIn("ss -H -ltn 'sport = :8080' | grep -q .",MODULE.GUEST)
    def test_keeps_pending_signup_blocked(self):
        self.assertIn('/v1/auth/sign-up',MODULE.GUEST)
        self.assertIn('= 503',MODULE.GUEST)

if __name__=='__main__': unittest.main()
