"""Contract tests for the Oracle notification dispatch boundary."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from oracle_domain_read import ApiError
from oracle_notifications import NotificationsApi

USER = '11111111-1111-4111-8111-111111111111'
TARGET = '22222222-2222-4222-8222-222222222222'
OFFER = '33333333-3333-4333-8333-333333333333'


class FakeAuth:
    def resolve(self, authorization):
        return USER


class FakeWrites:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def query(self, user_id, sql):
        self.calls.append((user_id, sql))
        if self.error:
            raise self.error
        # The real RPC returns void; a successful SQL call does not prove an insert.
        return {'accepted': True, 'result': None}


class NotificationDispatchTests(unittest.TestCase):
    def setUp(self):
        self.writes = FakeWrites()
        self.api = NotificationsApi(auth=FakeAuth(), writes=self.writes)
        self.body = {
            'targetUserId': TARGET, 'type': 'offer_received',
            'title': 'Offer received', 'body': 'A new offer',
            'itemId': None, 'offerId': OFFER, 'dealId': None, 'messageId': None,
        }

    def dispatch(self, body):
        return self.api.handle('POST', '/v1/notifications/dispatch', 'Bearer test', body)

    def test_void_rpc_is_acknowledged_as_accepted_not_created(self):
        status, result = self.dispatch(self.body)
        self.assertEqual(status, 200)
        self.assertEqual(result, {'accepted': True})
        self.assertNotIn('ok', result)
        self.assertNotIn('created', result)
        self.assertEqual(len(self.writes.calls), 1)
        self.assertIn('public.create_notification(', self.writes.calls[0][1])

    def test_unsupported_event_is_rejected_before_database_access(self):
        for kind in ('new_offer', 'system', None, [], {}):
            with self.subTest(kind=kind):
                body = dict(self.body, type=kind)
                with self.assertRaises(ApiError) as caught:
                    self.dispatch(body)
                self.assertEqual(caught.exception.status, 400)
        self.assertEqual(self.writes.calls, [])

    def test_database_error_is_not_acknowledged(self):
        self.writes.error = ApiError(409, 'domain_write_rejected')
        with self.assertRaises(ApiError) as caught:
            self.dispatch(self.body)
        self.assertEqual(caught.exception.status, 409)


if __name__ == '__main__':
    unittest.main()
