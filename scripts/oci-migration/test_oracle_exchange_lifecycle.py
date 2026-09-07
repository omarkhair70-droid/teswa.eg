"""Regression coverage for Oracle exchange lifecycle endpoints.

These tests use a fake database. They do not claim live OCI/RLS verification.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('exchange_lifecycle', ROOT / 'oracle_exchange.py')
exchange = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exchange)
UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
OFFER = '33333333-3333-4333-8333-333333333333'
DEAL = '44444444-4444-4444-8444-444444444444'


class Auth:
    def resolve(self, token):
        if token != 'Bearer valid':
            raise exchange.ApiError(401, 'invalid_session')
        return UID


class DB:
    def __init__(self, result=None):
        self.result = {'ok': True} if result is None else result
        self.calls = []

    def query(self, user_id, statement):
        self.calls.append((user_id, statement))
        return self.result


class LifecycleTests(unittest.TestCase):
    def request(self, path, body, result=None):
        db = DB(result)
        status, data = exchange.ExchangeApi(Auth(), db).handle('POST', path, 'Bearer valid', body)
        return status, data, db

    def test_offer_transitions_call_existing_rpcs(self):
        for suffix, function in [('thinking', 'mark_offer_thinking'), ('soft-reject', 'soft_reject_offer')]:
            with self.subTest(suffix=suffix):
                status, data, db = self.request('/v1/offers/' + OFFER + '/' + suffix, {'note': '  تمام  '})
                self.assertEqual((status, data), (200, {'ok': True}))
                self.assertEqual(db.calls[0][0], UID)
                self.assertIn('public.' + function + '(', db.calls[0][1])
                self.assertIn("decode('", db.calls[0][1])
                self.assertNotIn('تمام', db.calls[0][1])

    def test_void_rpc_is_not_an_unused_subquery(self):
        _, _, db = self.request('/v1/deals/' + DEAL + '/read', {})
        self.assertIn("'result',public.mark_deal_thread_read(", db.calls[0][1])
        self.assertNotIn('FROM (SELECT public.mark_deal_thread_read', db.calls[0][1])
        with self.assertRaises(exchange.ApiError) as error:
            self.request('/v1/deals/' + DEAL + '/read', {}, {})
        self.assertEqual(error.exception.status, 503)

    def test_confirmation_is_identity_bound_and_idempotent(self):
        body = {'userId': UID, 'note': "  hello'); DROP TABLE x;--  "}
        status, data, db = self.request('/v1/deals/' + DEAL + '/confirmations', body, {'ok': True, 'inserted': 1})
        self.assertEqual((status, data), (200, {'ok': True}))
        sql = db.calls[0][1]
        self.assertIn('INSERT INTO public.deal_confirmations', sql)
        self.assertIn('ON CONFLICT DO NOTHING', sql)
        self.assertNotIn('DROP TABLE', sql)
        self.assertIn("decode('", sql)
        self.assertEqual(self.request('/v1/deals/' + DEAL + '/confirmations', {'userId': UID}, {'ok': True, 'inserted': 0})[1], {'ok': True})
        with self.assertRaises(exchange.ApiError) as error:
            self.request('/v1/deals/' + DEAL + '/confirmations', {'userId': UID}, {'ok': False})
        self.assertEqual(error.exception.status, 503)

    def test_complete_preserves_true_and_false(self):
        for completed in (True, False):
            status, data, db = self.request('/v1/deals/' + DEAL + '/complete', {}, {'completed': completed})
            self.assertEqual((status, data), (200, {'completed': completed}))
            self.assertIn('public.complete_deal_if_ready', db.calls[0][1])
        for bad in ({}, {'completed': None}, {'completed': 1}):
            with self.subTest(bad=bad), self.assertRaises(exchange.ApiError) as error:
                self.request('/v1/deals/' + DEAL + '/complete', {}, bad)
            self.assertEqual(error.exception.status, 503)

    def test_invalid_requests_never_query_database(self):
        cases = [
            ('/v1/deals/' + DEAL + '/confirmations', {'userId': OTHER}, 403),
            ('/v1/deals/' + DEAL + '/confirmations', {'userId': UID, 'extra': True}, 400),
            ('/v1/deals/' + DEAL + '/confirmations', {'userId': UID, 'note': 4}, 400),
            ('/v1/offers/' + OFFER + '/thinking', {'note': 'x' * 1001}, 400),
            ('/v1/offers/' + OFFER + '/soft-reject', {'extra': True}, 400),
            ('/v1/deals/' + DEAL + '/read', {'extra': True}, 400),
            ('/v1/deals/' + DEAL + '/complete', {'extra': True}, 400),
            ('/v1/deals/not-a-uuid/complete', {}, 404),
            ('/v1/deals/' + DEAL + '/complete?admin=true', {}, 400),
        ]
        for path, body, expected in cases:
            with self.subTest(path=path, body=body):
                db = DB()
                with self.assertRaises(exchange.ApiError) as error:
                    exchange.ExchangeApi(Auth(), db).handle('POST', path, 'Bearer valid', body)
                self.assertEqual(error.exception.status, expected)
                self.assertEqual(db.calls, [])
        db = DB()
        with self.assertRaises(exchange.ApiError) as error:
            exchange.ExchangeApi(Auth(), db).handle('POST', '/v1/deals/' + DEAL + '/complete', None, {})
        self.assertEqual(error.exception.status, 401)
        self.assertEqual(db.calls, [])


if __name__ == '__main__':
    unittest.main()
