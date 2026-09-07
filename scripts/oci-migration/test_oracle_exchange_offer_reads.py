"""Offer validation/owned-listing read regressions; fake DB, no live OCI claim."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('exchange_read_offer_test', ROOT / 'oracle_exchange_read.py')
read = importlib.util.module_from_spec(spec)
spec.loader.exec_module(read)
UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
ITEM = '33333333-3333-4333-8333-333333333333'


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


class OfferReadTests(unittest.TestCase):
    def test_item_validation_returns_existing_shape(self):
        row = {'id': ITEM, 'title': 'Book', 'ownerId': OTHER, 'status': 'active'}
        db = DB(row)
        status, data = read.ExchangeReadApi(Auth(), db).handle('GET', '/v1/offers/items/' + ITEM, 'Bearer valid')
        self.assertEqual((status, data), (200, row))
        self.assertEqual(db.calls[0][0], UID)
        self.assertIn('public.items', db.calls[0][1])
        self.assertIn('i.owner_id AS "ownerId"', db.calls[0][1])
        self.assertIn("i.id='" + ITEM + "'::uuid", db.calls[0][1])
        with self.assertRaises(read.ApiError) as error:
            read.ExchangeReadApi(Auth(), DB(None)).handle('GET', '/v1/offers/items/' + ITEM, 'Bearer valid')
        self.assertEqual(error.exception.status, 404)

    def test_owned_ids_are_identity_scoped_and_ordered(self):
        row = {'id': ITEM, 'createdAt': '2026-09-07T00:00:00Z'}
        db = DB({'items': [row, row], 'hasMore': True})
        status, data = read.ExchangeReadApi(Auth(), db).handle(
            'GET', '/v1/offers/owned-active-items?userId=' + UID + '&limit=1&offset=10', 'Bearer valid')
        self.assertEqual((status, data), (200, {'items': [row], 'hasMore': True}))
        sql = db.calls[0][1]
        self.assertIn("i.owner_id='" + UID + "'::uuid", sql)
        self.assertIn("i.status='active'::public.item_status", sql)
        self.assertIn('ORDER BY x."createdAt" DESC,x.id DESC', sql)
        self.assertIn('LIMIT 2 OFFSET 10', sql)
        self.assertEqual(db.calls[0][0], UID)

    def test_invalid_requests_never_query_database(self):
        cases = [
            ('/v1/offers/owned-active-items?userId=' + OTHER, 403),
            ('/v1/offers/owned-active-items?limit=0', 400),
            ('/v1/offers/owned-active-items?limit=51', 400),
            ('/v1/offers/owned-active-items?offset=-1', 400),
            ('/v1/offers/owned-active-items?limit=1&limit=2', 400),
            ('/v1/offers/owned-active-items?admin=true', 400),
            ('/v1/offers/items/' + ITEM + '?admin=true', 400),
            ('/v1/offers/items/not-a-uuid', 404),
        ]
        for path, expected in cases:
            with self.subTest(path=path):
                db = DB(None)
                with self.assertRaises(read.ApiError) as error:
                    read.ExchangeReadApi(Auth(), db).handle('GET', path, 'Bearer valid')
                self.assertEqual(error.exception.status, expected)
                self.assertEqual(db.calls, [])
        db = DB(None)
        with self.assertRaises(read.ApiError) as error:
            read.ExchangeReadApi(Auth(), db).handle('GET', '/v1/offers/owned-active-items', None)
        self.assertEqual(error.exception.status, 401)
        self.assertEqual(db.calls, [])

    def test_malformed_results_fail_closed(self):
        with self.assertRaises(read.ApiError):
            read.ExchangeReadApi(Auth(), DB({'id': OTHER})).handle('GET', '/v1/offers/items/' + ITEM, 'Bearer valid')
        with self.assertRaises(read.ApiError):
            read.ExchangeReadApi(Auth(), DB({'items': [1] * 52})).handle('GET', '/v1/offers/owned-active-items?limit=50', 'Bearer valid')


if __name__ == '__main__':
    unittest.main()
