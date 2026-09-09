import http.client
import importlib.util
import json
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('domain_service', ROOT / 'oracle_domain_service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class Api:
    def __init__(self): self.calls = []
    def handle(self, method, path, authorization):
        self.calls.append((method, path, authorization))
        if path == '/v1/marketplace/feed': return 200, {'items': [], 'hasMore': False}
        raise service.ApiError(404, 'not_found')


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = Api()
        cls.server = service.Server(('127.0.0.1', 0), cls.api)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(2)

    def request(self, path, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            conn.request('GET', path, headers=headers or {})
            response = conn.getresponse()
            return response.status, json.loads(response.read()), dict(response.getheaders())
        finally: conn.close()

    def test_health_is_explicitly_rehearsal(self):
        status, body, headers = self.request('/healthz')
        self.assertEqual(status, 200); self.assertFalse(body['productionTraffic'])
        self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_feed_requires_and_forwards_exact_authorization(self):
        self.assertEqual(self.request('/v1/marketplace/feed')[0], 401)
        self.assertEqual(self.request('/v1/marketplace/feed', {'Authorization': 'Bearer valid'})[0], 200)
        self.assertEqual(self.api.calls[-1], ('GET', '/v1/marketplace/feed', 'Bearer valid'))

    def test_api_errors_are_bounded_json(self):
        status, body, _ = self.request('/unknown', {'Authorization': 'Bearer valid'})
        self.assertEqual((status, body), (404, {'error': 'not_found'}))


if __name__ == '__main__': unittest.main()
