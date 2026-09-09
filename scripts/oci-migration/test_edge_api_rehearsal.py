import importlib.util
import json
import os
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
        subprocess.run(['bash','-n'],input=value,text=True,check=True)
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

    def run_curl_checks(self, session_status='401', signup_status='503'):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'noise-a').touch(); (root/'noise-b').touch()
            bin_dir=root/'bin'; bin_dir.mkdir()
            fake=bin_dir/'curl'
            fake.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
with open(os.environ['CURL_LOG'],'a') as f:f.write(json.dumps(args)+'\\n')
url=args[-1]
if url.endswith('/v1/auth/healthz'):
    print('{"status":"ok","supabaseRuntimeDependency":false}',end='')
elif url.endswith('/v1/auth/session'):
    Path(args[args.index('-o')+1]).write_text('{"error":"invalid_session"}')
    print(os.environ['FAKE_SESSION_STATUS'],end='')
else:
    Path(args[args.index('-o')+1]).write_text('{"error":"confirmation_delivery_not_configured"}')
    print(os.environ['FAKE_SIGNUP_STATUS'],end='')
''')
            fake.chmod(0o755)
            tail=MODULE.GUEST.split('\nR=',1)[1]
            script='set -Eeuo pipefail\nH='+MODULE.HOST+'; P='+MODULE.PRIVATE+'; D='+str(root)+'; B='+str(root/'before')+'\nR='+tail
            env=dict(os.environ,PATH=str(bin_dir)+os.pathsep+os.environ['PATH'],CURL_LOG=str(root/'curl.jsonl'),FAKE_SESSION_STATUS=session_status,FAKE_SIGNUP_STATUS=signup_status)
            result=subprocess.run(['bash','-c',script],cwd=root,env=env,text=True,capture_output=True,timeout=10)
            calls=[json.loads(line) for line in (root/'curl.jsonl').read_text().splitlines()]
            expected=['--noproxy','*','--resolve',MODULE.HOST+':443:'+MODULE.PRIVATE,'--connect-timeout','3','--max-time','10']
            for args in calls:self.assertEqual(args[:8],expected)
            return result,calls

    def test_curl_argv_is_literal_with_files_present(self):
        result,calls=self.run_curl_checks()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(len(calls),3)
        self.assertIn('session_http=401',result.stdout)
        self.assertIn('signup_http=503',result.stdout)
        self.assertIn('edge_public_api=PASS',result.stdout)
    def test_wrong_session_status_fails_closed(self):
        result,calls=self.run_curl_checks(session_status='502')
        self.assertEqual(result.returncode,21)
        self.assertEqual(len(calls),2)
        self.assertIn('session_http=502',result.stdout)
        self.assertNotIn('edge_public_api=PASS',result.stdout)
    def test_wrong_signup_status_fails_closed(self):
        result,calls=self.run_curl_checks(signup_status='200')
        self.assertEqual(result.returncode,22)
        self.assertEqual(len(calls),3)
        self.assertIn('signup_http=200',result.stdout)
        self.assertNotIn('edge_public_api=PASS',result.stdout)

if __name__=='__main__': unittest.main()
