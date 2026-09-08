import http.client
import importlib.util
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).with_name('auth-api-shadow-gateway.py'))
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class Upstream(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *args): pass

    def do_GET(self):
        self.reply()

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        self.reply()

    def do_DELETE(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        self.reply()

    def reply(self):
        self.seen.append((self.path, dict(self.headers)))
        result = {'status': 'ok'} if self.path == '/healthz' else {'error': 'invalid_session'}
        self.send_response(200 if self.path == '/healthz' else 401)
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        cls.server = gateway.Server(('127.0.0.1', 0), cls.upstream.server_port)
        for server in (cls.upstream, cls.server):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        for server in (cls.upstream, cls.server):
            server.shutdown()
            server.server_close()

    def request(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            c.request(method, path, body, headers or {})
            r = c.getresponse()
            return r.status, json.loads(r.read()), dict(r.getheaders())
        finally:
            c.close()

    def test_health_is_explicitly_rehearsal(self):
        status, body, headers = self.request('GET', '/healthz')
        self.assertEqual(status, 200)
        self.assertIs(body['productionTraffic'], False)
        self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_auth_health_forwarded(self):
        self.assertEqual(self.request('GET', '/v1/auth/healthz')[0], 200)

    def test_marketplace_paths_forward_to_separate_domain_upstream(self):
        domain = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=domain.serve_forever, daemon=True); thread.start()
        server = gateway.Server(('127.0.0.1', 0), self.upstream.server_port, domain.server_port)
        gateway_thread = threading.Thread(target=server.serve_forever, daemon=True); gateway_thread.start()
        try:
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            conn.request('GET', '/v1/marketplace/feed?limit=20', headers={'Authorization': 'Bearer test'})
            response = conn.getresponse()
            self.assertEqual(response.status, 401)
            response.read(); conn.close()
            self.assertEqual(Upstream.seen[-1][0], '/v1/marketplace/feed?limit=20')
        finally:
            server.shutdown(); server.server_close(); domain.shutdown(); domain.server_close()
            gateway_thread.join(2); thread.join(2)

    def test_media_mutations_forward_only_to_domain_upstream(self):
        domain = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=domain.serve_forever, daemon=True); thread.start()
        server = gateway.Server(('127.0.0.1', 0), self.upstream.server_port, domain.server_port)
        gateway_thread = threading.Thread(target=server.serve_forever, daemon=True); gateway_thread.start()
        try:
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            conn.request('POST', '/v1/media/uploads', '{}', {'Content-Type':'application/json','Authorization':'Bearer test'})
            response=conn.getresponse(); self.assertEqual(response.status,401); response.read(); conn.close()
            self.assertEqual(Upstream.seen[-1][0],'/v1/media/uploads')
        finally:
            server.shutdown(); server.server_close(); domain.shutdown(); domain.server_close()
            gateway_thread.join(2); thread.join(2)

    def test_offer_creation_forwards_only_to_domain_upstream(self):
        domain = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=domain.serve_forever, daemon=True); thread.start()
        server = gateway.Server(('127.0.0.1', 0), self.upstream.server_port, domain.server_port)
        gateway_thread = threading.Thread(target=server.serve_forever, daemon=True); gateway_thread.start()
        try:
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            conn.request('POST', '/v1/offers', '{}', {
                'Content-Type':'application/json', 'Authorization':'Bearer test',
            })
            response=conn.getresponse(); self.assertEqual(response.status,401); response.read(); conn.close()
            self.assertEqual(Upstream.seen[-1][0],'/v1/offers')
        finally:
            server.shutdown(); server.server_close(); domain.shutdown(); domain.server_close()
            gateway_thread.join(2); thread.join(2)

    def test_profile_routes_are_strictly_forwarded_to_domain(self):
        domain = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=domain.serve_forever, daemon=True); thread.start()
        server = gateway.Server(('127.0.0.1', 0), self.upstream.server_port, domain.server_port)
        gateway_thread = threading.Thread(target=server.serve_forever, daemon=True); gateway_thread.start()
        try:
            for method,path,body in (
                ('GET','/v1/profiles/me',None),('GET','/v1/people?page=1&pageSize=20',None),
                ('POST','/v1/profiles/22222222-2222-4222-8222-222222222222/follow','{}'),
            ):
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                headers={'Authorization':'Bearer test'}
                if body is not None: headers['Content-Type']='application/json'
                conn.request(method,path,body,headers); response=conn.getresponse()
                self.assertEqual(response.status,401); response.read(); conn.close()
                self.assertEqual(Upstream.seen[-1][0],path)
            self.assertEqual(self.request('GET','/v1/profiles/not-a-user')[0],404)
        finally:
            server.shutdown(); server.server_close(); domain.shutdown(); domain.server_close()
            gateway_thread.join(2); thread.join(2)

    def test_unauthorized_status_preserved(self):
        self.assertEqual(self.request('GET', '/v1/auth/session')[0], 401)

    def test_only_bearer_header_forwarded(self):
        self.request('GET', '/v1/auth/session', headers={'Authorization': 'Bearer test', 'X-User-Id': 'forged', 'Cookie': 'secret=test'})
        headers = Upstream.seen[-1][1]
        self.assertEqual(headers['Authorization'], 'Bearer test')
        self.assertNotIn('X-User-Id', headers)
        self.assertNotIn('Cookie', headers)

    def test_unknown_paths_never_forwarded(self):
        count = len(Upstream.seen)
        for path in ('/etc/passwd', '/v1/auth/session?token=secret', '/v1/auth/../admin', '//evil.example/'):
            self.assertEqual(self.request('GET', path)[0], 404)
        self.assertEqual(len(Upstream.seen), count)

    def test_signup_waits_for_actual_delivery(self):
        self.assertEqual(self.request('POST', '/v1/auth/sign-up', '{}', {'Content-Type': 'application/json'})[0], 503)

    def test_json_object_required(self):
        for body in ('[]', 'null', '"password"', '{'):
            self.assertEqual(self.request('POST', '/v1/auth/password', body, {'Content-Type': 'application/json'})[0], 400)

    def test_wrong_content_type_rejected(self):
        self.assertEqual(self.request('POST', '/v1/auth/password', '{}')[0], 415)

    def test_oversize_rejected_before_read(self):
        self.assertEqual(self.request('POST', '/v1/auth/password', headers={'Content-Length': str(gateway.MAX_BODY+1)})[0], 413)


if __name__ == '__main__':
    unittest.main()
