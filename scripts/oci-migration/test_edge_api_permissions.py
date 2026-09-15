import importlib.util
import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('edge-api-rehearsal.py')
SPEC = importlib.util.spec_from_file_location('edge_api_rehearsal', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class SmokePermissionsTests(unittest.TestCase):
    def test_smoke_does_not_write_to_root_only_backup_directory(self):
        guest = MODULE.GUEST
        self.assertIn('sudo -n mktemp -d /var/lib/teswa/ingress-backups/api-XXXXXX', guest)
        self.assertEqual(guest.count('-o /dev/null -w'), 2)
        self.assertNotIn('-o "$D/session"', guest)
        self.assertNotIn('-o "$D/signup"', guest)
        self.assertIn('session_http=$S', guest)
        self.assertIn('signup_http=$S', guest)
        self.assertIn('[ "$S" = 401 ] || exit 21', guest)
        self.assertIn('[ "$S" = 503 ] || exit 22', guest)

    def test_validation_noise_is_not_emitted_on_success(self):
        self.assertIn('V=$(sudo -n caddy validate', MODULE.GUEST)
        self.assertIn('exit 14;', MODULE.GUEST)
        self.assertIn('trap rollback EXIT', MODULE.GUEST)
        value = MODULE.GUEST.replace('__HOST__', MODULE.HOST).replace('__PRIVATE__', MODULE.PRIVATE).replace('__CORE__', MODULE.CORE)
        self.assertLessEqual(len(value.encode()), 4096)
        subprocess.run(['bash', '-n'], input=value, text=True, check=True)

if __name__ == '__main__':
    unittest.main()
