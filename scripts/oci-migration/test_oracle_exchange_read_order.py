"""Ordering contract for Oracle deal-message pagination."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('exchange_read', ROOT / 'oracle_exchange_read.py')
read = importlib.util.module_from_spec(spec)
spec.loader.exec_module(read)
UID = '11111111-1111-4111-8111-111111111111'
DEAL = '44444444-4444-4444-8444-444444444444'


class Auth:
    def resolve(self, token):
        return UID


class DB:
    def __init__(self):
        self.calls = []
    def query(self, user_id, sql):
        self.calls.append((user_id, sql))
        return {'items': [], 'hasMore': False}


class OrderTests(unittest.TestCase):
    def test_ascending_order_is_explicit_and_stable(self):
        db = DB()
        read.ExchangeReadApi(Auth(), db).handle('GET', '/v1/deals/' + DEAL + '/messages?order=asc&limit=25&offset=10', 'Bearer valid')
        self.assertIn('ORDER BY m.created_at ASC,m.id ASC LIMIT 26 OFFSET 10', db.calls[0][1])

    def test_default_remains_descending(self):
        self.assertIn('ORDER BY m.created_at DESC,m.id DESC', read.messages_sql(UID, DEAL, 50, 0))

    def test_invalid_order_never_queries_database(self):
        db = DB()
        with self.assertRaises(read.ApiError) as error:
            read.ExchangeReadApi(Auth(), db).handle('GET', '/v1/deals/' + DEAL + '/messages?order=asc%3BDROP', 'Bearer valid')
        self.assertEqual(error.exception.status, 400)
        self.assertEqual(db.calls, [])


if __name__ == '__main__':
    unittest.main()
