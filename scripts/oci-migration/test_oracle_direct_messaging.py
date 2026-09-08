import unittest

from oracle_direct_messaging import DirectMessagingApi
from oracle_domain_read import ApiError

USER = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
CONVERSATION = '33333333-3333-4333-8333-333333333333'
MESSAGE = '44444444-4444-4444-8444-444444444444'


class Auth:
    def resolve(self, value):
        if value != 'Bearer session':
            raise ApiError(401, 'invalid_session')
        return USER


class Db:
    def __init__(self, values):
        self.values = list(values)
        self.calls = []

    def query(self, user_id, statement):
        self.calls.append((user_id, statement))
        return self.values.pop(0)


class DirectMessagingTests(unittest.TestCase):
    def api(self, values):
        db = Db(values)
        return DirectMessagingApi(Auth(), db), db

    def test_start_uses_authenticated_rpc_and_ignores_no_client_actor(self):
        api, db = self.api([[{'ok': True, 'conversation_id': CONVERSATION, 'status': 'requested',
                             'requires_request': True, 'message': 'sent'}]])
        status, body = api.handle('POST', '/v1/direct/conversations/start', 'Bearer session',
                                  {'targetUserId': OTHER})
        self.assertEqual(status, 200)
        self.assertEqual(body['conversationId'], CONVERSATION)
        self.assertIn('start_or_get_direct_conversation', db.calls[0][1])
        self.assertEqual(db.calls[0][0], USER)

    def test_list_maps_rpc_rows_to_application_contract(self):
        api, _ = self.api([[{'conversation_id': CONVERSATION, 'status': 'accepted',
                            'requested_by': USER, 'other_user_id': OTHER,
                            'other_display_name': 'Other', 'other_username': 'other',
                            'other_avatar_url': None, 'last_message_body': 'hi',
                            'last_message_sender_id': OTHER, 'last_message_at': '2026-09-08T00:00:00Z',
                            'unread_count': 2, 'requires_action': False}]])
        status, body = api.handle('GET', '/v1/direct/conversations', 'Bearer session')
        self.assertEqual(status, 200)
        self.assertEqual(body['items'][0]['unreadCount'], 2)
        self.assertEqual(body['items'][0]['otherUserId'], OTHER)

    def test_native_message_requires_owned_storage_path(self):
        api, db = self.api([])
        payload = {'body': None, 'replyToMessageId': None, 'attachments': [{
            'kind': 'audio', 'storagePath': 'direct/%s/%s/voice.m4a' % (CONVERSATION, OTHER),
            'storageBucket': 'direct-voice-messages', 'fileName': 'voice.m4a',
            'mimeType': 'audio/m4a', 'sizeBytes': 42, 'durationMs': 1200,
            'width': None, 'height': None,
        }], 'metadata': {}}
        with self.assertRaises(ApiError) as caught:
            api.handle('POST', '/v1/direct/conversations/%s/native' % CONVERSATION,
                       'Bearer session', payload)
        self.assertEqual((caught.exception.status, caught.exception.code), (403, 'attachment_not_owned'))
        self.assertEqual(db.calls, [])

    def test_native_message_passes_bounded_json_to_rpc(self):
        api, db = self.api([[{'ok': True, 'message': 'sent', 'message_id': MESSAGE,
                             'conversation_id': CONVERSATION, 'created_at': '2026-09-08T00:00:00Z'}]])
        payload = {'body': '', 'replyToMessageId': None, 'attachments': [{
            'kind': 'audio', 'storagePath': 'direct/%s/%s/voice.m4a' % (CONVERSATION, USER),
            'storageBucket': 'direct-voice-messages', 'fileName': 'voice.m4a',
            'mimeType': 'audio/m4a', 'sizeBytes': 42, 'durationMs': 1200,
            'width': None, 'height': None,
        }], 'metadata': {'source': 'composer'}}
        status, body = api.handle('POST', '/v1/direct/conversations/%s/native' % CONVERSATION,
                                  'Bearer session', payload)
        self.assertEqual(status, 200)
        self.assertTrue(body['ok'])
        self.assertIn('send_direct_native_message', db.calls[0][1])
        self.assertNotIn('voice.m4a', db.calls[0][1])

    def test_reaction_is_allowlisted_before_rpc(self):
        api, db = self.api([])
        with self.assertRaises(ApiError) as caught:
            api.handle('POST', '/v1/direct/messages/%s/reaction' % MESSAGE,
                       'Bearer session', {'reaction': 'admin'})
        self.assertEqual(caught.exception.code, 'invalid_reaction')
        self.assertEqual(db.calls, [])

    def test_typing_read_excludes_current_user_and_relies_on_rls(self):
        api, db = self.api([[OTHER]])
        status, body = api.handle('GET', '/v1/direct/conversations/%s/typing' % CONVERSATION,
                                  'Bearer session')
        self.assertEqual((status, body), (200, {'userIds': [OTHER]}))
        self.assertIn("user_id<>'%s'::uuid" % USER, db.calls[0][1])


if __name__ == '__main__':
    unittest.main()
