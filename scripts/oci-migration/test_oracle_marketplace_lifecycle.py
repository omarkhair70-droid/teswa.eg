import http.client
import json
import threading
import unittest

from oracle_domain_read import ApiError
from oracle_marketplace_lifecycle import MarketplaceLifecycleApi
from oracle_domain_service import Server

UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'


class Auth:
    def resolve(self, authorization):
        if authorization != 'Bearer valid':
            raise ApiError(401, 'invalid_session')
        return UID


class DB:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def query(self, user_id, statement):
        self.calls.append((user_id, statement))
        return self.result


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.reads = DB([])
        self.writes = DB({'code': 'archived'})
        self.api = MarketplaceLifecycleApi(Auth(), self.reads, self.writes)

    def call(self, method, action, body=None, item_id=OTHER, authorization='Bearer valid'):
        return self.api.handle(method, '/v1/marketplace/items/' + item_id + '/' + action, authorization, body)

    def test_uses_existing_portable_rpcs_with_verified_actor(self):
        for action, function, success in (
            ('archive', 'archive_owned_listing_if_safe', 'archived'),
            ('reactivate', 'reactivate_owned_archived_listing', 'reactivated'),
            ('delete-archived', 'delete_owned_archived_listing_if_safe', 'deleted'),
        ):
            with self.subTest(action=action):
                self.writes.result = {'code': success}
                self.assertEqual(self.call('POST', action, {})[1], {'code': success})
                actor, sql = self.writes.calls[-1]
                self.assertEqual(actor, UID)
                self.assertIn('public.' + function, sql)
                self.assertIn("'" + OTHER + "'::uuid", sql)
                self.assertNotIn('DELETE FROM public.items', sql)
                self.assertNotIn('auth.uid()', sql)

    def test_lifecycle_rejections_are_preserved(self):
        for code in ('not_found_or_unauthorized', 'not_active', 'not_archived',
                     'has_open_offers', 'has_deal_history'):
            with self.subTest(code=code):
                self.writes.result = {'code': code}
                self.assertEqual(self.call('POST', 'archive', {})[1], {'code': code})

    def test_rejects_spoofed_body_and_invalid_method(self):
        for body in ({'ownerId': OTHER}, {'userId': OTHER}, {'force': True}, None):
            with self.subTest(body=body), self.assertRaises(ApiError) as error:
                self.call('POST', 'delete-archived', body)
            self.assertEqual(error.exception.status, 400)
        with self.assertRaises(ApiError) as error:
            self.call('GET', 'delete-archived')
        self.assertEqual(error.exception.status, 405)
        self.assertEqual(self.writes.calls, [])

    def test_auth_and_uuid_validation(self):
        with self.assertRaises(ApiError) as error:
            self.call('POST', 'archive', {}, authorization='Bearer invalid')
        self.assertEqual(error.exception.status, 401)
        with self.assertRaises(ApiError) as error:
            self.call('POST', 'archive', {}, item_id='not-a-uuid')
        self.assertEqual(error.exception.status, 404)
        self.assertEqual(self.writes.calls, [])

    def test_image_urls_are_owner_scoped_and_validated(self):
        self.reads.result = ['https://example.test/a.jpg']
        self.assertEqual(self.call('GET', 'images/urls')[1], {'items': self.reads.result})
        actor, sql = self.reads.calls[-1]
        self.assertEqual(actor, UID)
        self.assertIn("i.owner_id='" + UID + "'::uuid", sql)
        self.assertIn("i.id='" + OTHER + "'::uuid", sql)
        self.assertEqual(self.writes.calls, [])
        self.reads.result = None
        with self.assertRaises(ApiError) as error:
            self.call('GET', 'images/urls')
        self.assertEqual(error.exception.status, 503)

    def test_invalid_rpc_result_fails_closed(self):
        for result in ({}, {'code': 'unexpected'}, None, {'code': None}):
            with self.subTest(result=result), self.assertRaises(ApiError) as error:
                self.writes.result = result
                self.call('POST', 'archive', {})
            self.assertEqual(error.exception.status, 503)


class RoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lifecycle = MarketplaceLifecycleApi(Auth(), DB([]), DB({'code': 'archived'}))
        cls.server = Server(('127.0.0.1', 0), marketplace_lifecycle=cls.lifecycle)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(2)

    def request(self, method, action, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        path = '/v1/marketplace/items/' + OTHER + '/' + action
        headers = {'Authorization': 'Bearer valid'}
        if method == 'POST':
            headers['Content-Type'] = 'application/json'
            body = json.dumps({} if body is None else body)
        try:
            conn.request(method, path, body=body, headers=headers)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_routes_through_lifecycle_not_generic_marketplace(self):
        self.assertEqual(self.request('POST', 'archive'), (200, {'code': 'archived'}))
        self.assertEqual(self.request('GET', 'images/urls'), (200, {'items': []}))
        self.assertEqual(self.request('POST', 'archive', {'force': True})[0], 400)
        self.assertEqual(self.request('GET', 'archive')[0], 405)


if __name__ == '__main__':
    unittest.main()
