import http.client
import importlib.util
import json
import threading
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

SPEC=importlib.util.spec_from_file_location('auth_email',Path(__file__).with_name('auth-email-runtime-server.py'))
auth_email=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(auth_email)
USER='11111111-1111-4111-8111-111111111111'
TOKEN='confirmation_token_that_is_long_enough_123456'

class Store:
    def __init__(self): self.calls=[]; self.account=False
    def active_count(self): return 0
    def email_state(self,_email): return (USER,False) if self.account else None
    def bootstrap_signup(self,email,password,display):
        self.calls.append(('signup',email,password,display)); self.account=True; return USER,TOKEN
    def resend_confirmation(self,email):
        self.calls.append(('resend',email)); return TOKEN if self.account else None
    def confirm_email(self,token):
        self.calls.append(('confirm',token)); return USER if token==TOKEN else None
    def auth_user(self,user_id):
        return {'id':user_id,'email':'user@example.test','phone':None,'display_name':'Test','avatar_url':None}

class Delivery:
    def __init__(self,fail=False): self.sent=[]; self.fail=fail
    def send_confirmation(self,email,token):
        self.sent.append((email,token))
        if self.fail: raise RuntimeError('confirmation_delivery_failed')

class Identity:
    users=set()
    by_provider_hash={}

class Tests(unittest.TestCase):
    def setUp(self):
        self.server=auth_email.Server(('127.0.0.1',0),auth_email.Handler)
        self.server.store=Store(); self.server.delivery=Delivery(); self.server.identity=Identity()
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(2)
    def request(self,method,path,body=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        raw=json.dumps(body).encode() if body is not None else None
        headers={'Content-Type':'application/json'} if raw is not None else {}
        conn.request(method,path,raw,headers); response=conn.getresponse()
        value=json.loads(response.read()); conn.close(); return response.status,value
    def test_signup_sends_raw_token_without_returning_it(self):
        status,body=self.request('POST','/v1/auth/sign-up',{'email':'user@example.test','password':'password-123'})
        self.assertEqual(status,201); self.assertEqual(body['confirmation_delivery'],'submitted')
        self.assertNotIn(TOKEN,json.dumps(body)); self.assertEqual(self.server.delivery.sent,[('user@example.test',TOKEN)])
    def test_unconfigured_or_failed_delivery_never_returns_success(self):
        self.server.delivery=None
        self.assertEqual(self.request('POST','/v1/auth/sign-up',{'email':'user@example.test','password':'password-123'})[0],503)
        self.assertEqual(self.server.store.calls,[])
        self.server.delivery=Delivery(True)
        self.assertEqual(self.request('POST','/v1/auth/sign-up',{'email':'user@example.test','password':'password-123'})[0],503)
    def test_resend_is_non_enumerating_and_delivers_when_account_exists(self):
        status,body=self.request('POST','/v1/auth/resend-confirmation',{'email':'missing@example.test'})
        self.assertEqual((status,body['accepted']),(202,True)); self.assertEqual(self.server.delivery.sent,[])
        unknown_body=body
        self.server.store.account=True
        status,body=self.request('POST','/v1/auth/resend-confirmation',{'email':'user@example.test'})
        self.assertEqual((status,body),(202,unknown_body))
        self.assertNotIn('confirmation_delivery',body)
        self.assertEqual(self.server.delivery.sent,[('user@example.test',TOKEN)])
    def test_confirmation_consumes_only_the_raw_url_token(self):
        status,body=self.request('GET','/v1/auth/confirm?token='+TOKEN)
        self.assertEqual((status,body['confirmed']),(200,True))
        self.assertEqual(self.server.store.calls[-1],('confirm',TOKEN))
        self.assertEqual(self.request('GET','/v1/auth/confirm?token=short')[0],400)
    def test_health_reports_delivery_runtime_state(self):
        self.assertTrue(self.request('GET','/healthz')[1]['confirmationDispatchConfigured'])
        self.server.delivery=None
        self.assertFalse(self.request('GET','/healthz')[1]['confirmationDispatchConfigured'])

class ResendTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        self.key=root/'key'; self.key.write_text('re_test_fixture_only'); self.key.chmod(0o600)
        self.config=root/'config.json'
        self.value={'provider':'resend','sender':'auth@example.test',
                    'public_base_url':'https://auth.example.test','api_key_file':str(self.key)}
    def delivery(self):
        self.config.write_text(json.dumps({'email_delivery':self.value}),encoding='utf-8')
        return auth_email.ConfirmationDelivery(str(self.config))
    def test_provider_submission_is_fixed_tls_and_requires_receipt(self):
        with patch.object(auth_email.http.client,'HTTPSConnection') as factory:
            response=factory.return_value.getresponse.return_value
            response.status=200; response.read.return_value=b'{"id":"provider-receipt"}'
            self.delivery().send_confirmation('user@example.test',TOKEN)
            factory.assert_called_once_with('api.resend.com',timeout=20)
            args,kwargs=factory.return_value.request.call_args
            self.assertEqual(args,('POST','/emails'))
            body=json.loads(kwargs['body'])
            self.assertEqual(body['to'],['user@example.test'])
            self.assertIn('/v1/auth/confirm?token='+TOKEN,body['text'])
            self.assertNotIn(TOKEN,kwargs['headers']['Idempotency-Key'])
            self.assertNotIn('re_test_fixture_only',str(body))
            factory.return_value.close.assert_called_once()
    def test_provider_errors_or_missing_receipt_fail_closed(self):
        for status,payload in [(401,b'{"message":"secret provider error"}'),(429,b'{}'),
                               (500,b'{}'),(200,b'{}'),(200,b'null'),(200,b'{"id":""}'),
                               (200,b'x'*65537)]:
            with self.subTest(status=status,payload=payload[:30]), patch.object(auth_email.http.client,'HTTPSConnection') as factory:
                response=factory.return_value.getresponse.return_value
                response.status=status; response.read.return_value=payload
                with self.assertRaisesRegex(RuntimeError,'^confirmation_delivery_failed$'):
                    self.delivery().send_confirmation('user@example.test',TOKEN)
                factory.return_value.close.assert_called_once()
    def test_transport_error_is_sanitized(self):
        with patch.object(auth_email.http.client,'HTTPSConnection') as factory:
            factory.return_value.request.side_effect=OSError('secret provider error')
            with self.assertRaisesRegex(RuntimeError,'^confirmation_delivery_failed$') as error:
                self.delivery().send_confirmation('user@example.test',TOKEN)
            self.assertIsNone(error.exception.__cause__)
    def test_invalid_provider_or_config_cannot_fallback(self):
        for change in [{'provider':'other'},{'public_base_url':'http://auth.example.test'},
                       {'public_base_url':'https://user:password@auth.example.test'},
                       {'sender':'a@example.test\r\nBcc: b@example.test'},
                       {'api_key_file':'relative-key'}, {'api_key':'must-not-inline'}]:
            with self.subTest(change=change):
                original=self.value.copy(); self.value.update(change)
                with self.assertRaises(SystemExit): self.delivery()
                self.value=original

if __name__=='__main__': unittest.main()
