import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
        self.assertIn("p.split(m,1)[1].count('reverse_proxy '+u)!=1",MODULE.GUEST)
        self.assertNotIn("p.count('reverse_proxy '+u)!=1",MODULE.GUEST)
        self.assertNotIn('handle {\n  reverse_proxy',MODULE.GUEST)
    def test_same_core_upstream_in_preserved_8080_is_not_ambiguous(self):
        embedded=MODULE.GUEST.split("<<'PY'\n",1)[1].split('\nPY\n',1)[0]
        original='''{
 auto_https disable_redirects
}
:8080 {
 reverse_proxy http://10.20.10.176:3100
}
# teswa-public-https-rehearsal
https://130-110-122-142.sslip.io {
 handle /healthz {
  respond "teswa-https-rehearsal" 200
 }
 handle {
  respond "Not found" 404
 }
}
'''
        with tempfile.TemporaryDirectory() as tmp:
            live=Path(tmp)/'Caddyfile'; candidate=Path(tmp)/'Caddyfile.next'
            live.write_text(original)
            def adapt(args,**_kwargs):
                path=Path(args[args.index('--config')+1])
                text=path.read_text()
                servers={'old':{'listen':[':8080'],'routes':[{'handle':[{'handler':'reverse_proxy','upstreams':[{'dial':'10.20.10.176:3100'}]}]}]}}
                if 'handle /v1/*' in text:
                    servers['https']={'listen':[':443'],'routes':[{'match':[{'path':['/v1/*']}],'handle':[{'handler':'reverse_proxy'}]}]}
                return subprocess.CompletedProcess(args,0,json.dumps({'apps':{'http':{'servers':servers}}}),'')
            argv=['embedded',str(live),str(candidate),MODULE.HOST,'http://'+MODULE.CORE]
            with mock.patch.object(sys,'argv',argv), mock.patch('subprocess.run',side_effect=adapt), mock.patch('os.chown',create=True):
                exec(compile(embedded,'<guest>','exec'),{})
            value=candidate.read_text()
            self.assertEqual(value.count('reverse_proxy http://10.20.10.176:3100'),2)
            self.assertEqual(value.split('# teswa-public-https-rehearsal',1)[1].count('reverse_proxy http://10.20.10.176:3100'),1)
    def test_preserves_existing_8080_server_semantically(self):
        self.assertIn("canon(server(a,':8080'))!=canon(server(b,':8080'))",MODULE.GUEST)
        self.assertNotIn('caddy reload',MODULE.GUEST)
        self.assertGreaterEqual(MODULE.GUEST.count('systemctl restart caddy'),2)
        self.assertIn("ss -H -ltn 'sport = :8080' | grep -q .",MODULE.GUEST)
    def test_keeps_pending_signup_blocked(self):
        self.assertIn('/v1/auth/sign-up',MODULE.GUEST)
        self.assertIn('= 503',MODULE.GUEST)

if __name__=='__main__': unittest.main()
