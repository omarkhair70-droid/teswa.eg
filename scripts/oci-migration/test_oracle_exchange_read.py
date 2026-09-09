"""Regression tests for the isolated exchange read API and HTTP dispatch."""
import http.client
import importlib.util
import json
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


read = load('oracle_exchange_read', 'oracle_exchange_read.py')
service = load('oracle_domain_service', 'oracle_domain_service.py')
UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
OFFER = '33333333-3333-4333-8333-333333333333'
DEAL = '44444444-4444-4444-8444-444444444444'


class Auth:
    def resolve(self, token):
        if token != 'Bearer valid':
            raise read.ApiError(401, 'invalid_session')
        return UID


class DB:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def query(self, user_id, sql):
        self.calls.append((user_id, sql))
        return self.result


class ExchangeReadTests(unittest.TestCase):
    def test_incoming_page_is_identity_bound_and_has_more(self):
        row = {'id': OFFER, 'senderId': OTHER, 'receiverId': UID, 'dealId': None}
        db = DB({'items': [row, row], 'hasMore': True})
        status, body = read.ExchangeReadApi(Auth(), db).handle(
            'GET', '/v1/offers?direction=incoming&limit=1', 'Bearer valid')
        self.assertEqual(status, 200)
        self.assertEqual(body, {'items': [row], 'hasMore': True})
        self.assertEqual(db.calls[0][0], UID)
        self.assertIn('o.receiver_id=', db.calls[0][1])
        self.assertIn('LIMIT 2 OFFSET 0', db.calls[0][1])

    def test_offer_and_deal_are_participant_filtered(self):
        for target, result in [('/v1/offers/' + OFFER, {'id': OFFER}),
                               ('/v1/deals/' + DEAL, {'id': DEAL})]:
            db = DB(result)
            self.assertEqual(read.ExchangeReadApi(Auth(), db).handle('GET', target, 'Bearer valid')[0], 200)
            self.assertIn(UID, db.calls[0][1])
            self.assertIn(' OR ', db.calls[0][1])
            with self.assertRaises(read.ApiError) as error:
                read.ExchangeReadApi(Auth(), DB(None)).handle('GET', target, 'Bearer valid')
            self.assertEqual(error.exception.status, 404)

    def test_messages_are_bounded_and_participant_filtered(self):
        db = DB({'items': [], 'hasMore': False})
        status, body = read.ExchangeReadApi(Auth(), db).handle(
            'GET', '/v1/deals/' + DEAL + '/messages?limit=25&offset=10', 'Bearer valid')
        self.assertEqual((status, body), (200, {'items': [], 'hasMore': False}))
        sql = db.calls[0][1]
        self.assertIn('LIMIT 26 OFFSET 10', sql)
        self.assertIn('EXISTS', sql)
        self.assertIn('d.requester_id=', sql)
        self.assertIn('d.offerer_id=', sql)

    def test_invalid_requests_never_query_database(self):
        db = DB(None)
        api = read.ExchangeReadApi(Auth(), db)
        cases = [
            ('GET', '/v1/offers', None, 401),
            ('POST', '/v1/offers', 'Bearer valid', 405),
            ('GET', '/v1/offers?direction=other', 'Bearer valid', 400),
            ('GET', '/v1/offers?limit=0', 'Bearer valid', 400),
            ('GET', '/v1/offers?limit=51', 'Bearer valid', 400),
            ('GET', '/v1/offers?limit=1&limit=2', 'Bearer valid', 400),
            ('GET', '/v1/offers?admin=true', 'Bearer valid', 400),
            ('GET', '/v1/offers/not-a-uuid', 'Bearer valid', 404),
            ('GET', '/v1/offers/' + 'z' * 36, 'Bearer valid', 404),
            ('GET', '/v1/deals/' + DEAL + '/messages?offset=-1', 'Bearer valid', 400),
        ]
        for method, target, token, expected in cases:
            with self.subTest(target=target), self.assertRaises(read.ApiError) as error:
                api.handle(method, target, token)
            self.assertEqual(error.exception.status, expected)
        self.assertEqual(db.calls, [])


class DispatchTests(unittest.TestCase):
    def test_get_uses_read_api_and_post_preserves_write_api(self):
        class Endpoint:
            def __init__(self, marker):
                self.marker = marker
                self.calls = []
            def handle(self, *args):
                self.calls.append(args)
                return 200, {'endpoint': self.marker}
        reader, writer = Endpoint('read'), Endpoint('write')
        server = service.Server(('127.0.0.1', 0), exchange=writer, exchange_read=reader)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for method, target, payload, expected in [
                ('GET', '/v1/offers', None, 'read'),
                ('GET', '/v1/deals/' + DEAL + '/messages', None, 'read'),
                ('POST', '/v1/offers', {}, 'write'),
            ]:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
                try:
                    body = json.dumps(payload) if payload is not None else None
                    headers = {'Authorization': 'Bearer valid'}
                    if body is not None:
                        headers['Content-Type'] = 'application/json'
                    conn.request(method, target, body=body, headers=headers)
                    response = conn.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(json.loads(response.read())['endpoint'], expected)
                finally:
                    conn.close()
            self.assertEqual(len(reader.calls), 2)
            self.assertEqual(len(writer.calls), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)


if __name__ == '__main__':
    unittest.main()
