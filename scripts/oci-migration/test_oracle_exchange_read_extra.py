"""Contract regressions for additional Oracle deal reads; no live database used."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('exchange_read_extra', ROOT / 'oracle_exchange_read_extra.py')
extra = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extra)
UID = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
DEAL = '44444444-4444-4444-8444-444444444444'


class DB:
    def __init__(self, result):
        self.result = result
        self.calls = []
    def query(self, user_id, sql):
        self.calls.append((user_id, sql))
        return self.result


def request(path, result, user_id=UID):
    from urllib.parse import parse_qs, urlsplit
    parsed = urlsplit(path)
    db = DB(result)
    return extra.handle_extra(parsed, parse_qs(parsed.query, keep_blank_values=True), user_id, db), db


class ReadTests(unittest.TestCase):
    def test_inbox_preserves_pagination_and_participant_scope(self):
        row = {'dealId': DEAL, 'unreadCount': 2, 'lastActivityAt': '2026-09-07T00:00:00Z'}
        result, db = request('/v1/deals/inbox?userId=' + UID + '&limit=1&offset=10', {'items': [row, row], 'hasMore': True})
        self.assertEqual(result, (200, {'items': [row], 'hasMore': True}))
        sql = db.calls[0][1]
        self.assertEqual(db.calls[0][0], UID)
        self.assertIn('d.requester_id=', sql)
        self.assertIn('d.offerer_id=', sql)
        self.assertIn('m.sender_id<>', sql)
        self.assertIn('r.last_read_at', sql)
        self.assertIn('ORDER BY m.created_at DESC,m.id DESC', sql)
        self.assertIn('LIMIT 2 OFFSET 10', sql)
        self.assertIn('otherParticipant', sql)
        self.assertIn('latestMessage', sql)
        self.assertIn('lastActivityAt', sql)

    def test_unread_uses_existing_rpc(self):
        result, db = request('/v1/deals/unread-count', 7)
        self.assertEqual(result, (200, {'count': 7}))
        self.assertEqual(db.calls[0][1], 'SELECT public.get_unread_deal_messages_count()')
        for value in (True, -1, None, '7'):
            with self.subTest(value=value), self.assertRaises(extra.ApiError):
                request('/v1/deals/unread-count', value)

    def test_confirmations_and_review_are_participant_filtered(self):
        result, db = request('/v1/deals/' + DEAL + '/confirmations', [UID, OTHER])
        self.assertEqual(result[1]['userIds'], [UID, OTHER])
        self.assertIn('public.deal_confirmations', db.calls[0][1])
        self.assertIn('d.requester_id=', db.calls[0][1])
        result, db = request('/v1/deals/' + DEAL + '/reviews?reviewerId=' + OTHER, False)
        self.assertEqual(result, (200, {'hasReview': False}))
        self.assertIn("r.reviewer_id='" + OTHER + "'::uuid", db.calls[0][1])
        self.assertIn('d.offerer_id=', db.calls[0][1])
        self.assertEqual(request('/v1/deals/' + DEAL + '/reviews?reviewerId=' + OTHER, True)[0][1], {'hasReview': True})
        with self.assertRaises(extra.ApiError):
            request('/v1/deals/' + DEAL + '/reviews?reviewerId=' + OTHER, 1)

    def test_message_count_validates_dates_and_encodes_values(self):
        path = '/v1/deals/' + DEAL + '/messages/count?senderId=' + OTHER + '&since=2026-09-07T10%3A00%3A00%2B03%3A00'
        result, db = request(path, 3)
        self.assertEqual(result, (200, {'count': 3}))
        sql = db.calls[0][1]
        self.assertIn('m.created_at>=', sql)
        self.assertIn('::timestamptz', sql)
        self.assertIn("m.sender_id='" + OTHER + "'::uuid", sql)
        self.assertIn('d.requester_id=', sql)
        self.assertIn("decode('", sql)
        self.assertNotIn('2026-09-07T10', sql)
        self.assertEqual(extra.valid_since('2026-09-07T10:00:00+03:00'), '2026-09-07T07:00:00+00:00')

    def test_bad_queries_do_not_touch_database(self):
        cases = [
            '/v1/deals/inbox?userId=' + OTHER,
            '/v1/deals/inbox?limit=0',
            '/v1/deals/inbox?limit=51',
            '/v1/deals/inbox?offset=-1',
            '/v1/deals/inbox?limit=1&limit=2',
            '/v1/deals/inbox?admin=true',
            '/v1/deals/unread-count?userId=' + UID,
            '/v1/deals/' + DEAL + '/confirmations?admin=true',
            '/v1/deals/' + DEAL + '/reviews?reviewerId=bad',
            '/v1/deals/' + DEAL + '/reviews',
            '/v1/deals/' + DEAL + '/messages/count?senderId=' + OTHER + '&since=2026-09-07',
            '/v1/deals/' + DEAL + '/messages/count?senderId=bad&since=2026-09-07T00:00:00Z',
            '/v1/deals/' + DEAL + '/messages/count?senderId=' + OTHER + '&since=bad',
        ]
        from urllib.parse import parse_qs, urlsplit
        for path in cases:
            with self.subTest(path=path):
                parsed = urlsplit(path)
                db = DB(None)
                with self.assertRaises(extra.ApiError):
                    extra.handle_extra(parsed, parse_qs(parsed.query, keep_blank_values=True), UID, db)
                self.assertEqual(db.calls, [])

    def test_unrelated_paths_are_not_intercepted(self):
        self.assertIsNone(request('/v1/deals/' + DEAL + '/messages', None)[0])
        self.assertIsNone(request('/v1/offers', None)[0])

    def test_malformed_database_response_fails_closed(self):
        for result in (None, {}, {'items': 'bad'}, {'items': [1] * 52}):
            with self.subTest(result=result), self.assertRaises(extra.ApiError):
                request('/v1/deals/inbox?limit=50', result)
        with self.assertRaises(extra.ApiError):
            request('/v1/deals/' + DEAL + '/confirmations', [None])
        with self.assertRaises(extra.ApiError):
            request('/v1/deals/' + DEAL + '/messages/count?senderId=' + OTHER + '&since=2026-09-07T00:00:00Z', -1)


if __name__ == '__main__':
    unittest.main()
