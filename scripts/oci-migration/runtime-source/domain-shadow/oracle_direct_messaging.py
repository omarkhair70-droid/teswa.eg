"""Authenticated direct messaging API backed by the migrated PostgreSQL RPCs."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner, json_expr


def _object(body, keys, code):
    if not isinstance(body, dict) or set(body) != set(keys):
        raise ApiError(400, code)
    return body


def _text(value, maximum=1200, required=True):
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise ApiError(400, 'invalid_message')
    value = value.strip()
    if (required and not value) or len(value) > maximum:
        raise ApiError(400, 'invalid_message')
    return value or None


def _rows(db, user_id, function, arguments=''):
    value = db.query(user_id, "SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM public.%s(%s) x" %
                     (function, arguments))
    if not isinstance(value, list):
        raise ApiError(503, 'direct_read_failed')
    return value


def _row(db, user_id, function, arguments=''):
    values = _rows(db, user_id, function, arguments)
    return values[0] if values else None


def _conversation(row):
    return {
        'conversationId': str(row['conversation_id']), 'status': row['status'],
        'requestedBy': str(row['requested_by']), 'otherUserId': str(row['other_user_id']),
        'otherDisplayName': row.get('other_display_name'), 'otherUsername': row.get('other_username'),
        'otherAvatarUrl': row.get('other_avatar_url'), 'lastMessageBody': row.get('last_message_body'),
        'lastMessageSenderId': str(row['last_message_sender_id']) if row.get('last_message_sender_id') else None,
        'lastMessageAt': row.get('last_message_at'), 'unreadCount': int(row.get('unread_count') or 0),
        'requiresAction': bool(row.get('requires_action')),
    }


def _message(row):
    return {
        'id': str(row['id']), 'senderId': str(row['sender_id']), 'body': row.get('body') or '',
        'messageType': 'voice' if row.get('message_type') == 'voice' else 'text',
        'audioStoragePath': row.get('audio_storage_path'),
        'audioDurationMs': row.get('audio_duration_ms'), 'audioMimeType': row.get('audio_mime_type'),
        'audioSizeBytes': row.get('audio_size_bytes'), 'createdAt': row['created_at'],
        'readAt': row.get('read_at'),
    }


def _native_message(row):
    attachments = row.get('attachments') if isinstance(row.get('attachments'), list) else []
    reactions = row.get('reactions') if isinstance(row.get('reactions'), list) else []
    return {
        'id': str(row['id']), 'senderId': str(row['sender_id']), 'body': row.get('body') or '',
        'messageType': 'voice' if row.get('message_type') == 'voice' else 'text',
        'createdAt': row['created_at'], 'readAt': row.get('read_at'),
        'replyToMessageId': str(row['reply_to_message_id']) if row.get('reply_to_message_id') else None,
        'replySenderId': str(row['reply_sender_id']) if row.get('reply_sender_id') else None,
        'replyBody': row.get('reply_body'),
        'metadata': row.get('metadata') if isinstance(row.get('metadata'), dict) else {},
        'deletedAt': row.get('deleted_at'), 'attachments': attachments, 'reactions': reactions,
    }


def _validate_attachments(value, conversation_id, user_id):
    if not isinstance(value, list) or len(value) > 5:
        raise ApiError(400, 'invalid_attachments')
    prefix = 'direct/%s/%s/' % (conversation_id, user_id)
    allowed = {'id', 'kind', 'storagePath', 'storageBucket', 'fileName', 'mimeType',
               'sizeBytes', 'durationMs', 'width', 'height'}
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) - allowed or item.get('kind') not in ('image', 'video', 'file', 'audio'):
            raise ApiError(400, 'invalid_attachments')
        path = item.get('storagePath')
        if (not isinstance(path, str) or not path.startswith(prefix) or len(path) > 1024 or
                '/' in path[len(prefix):] or any(part in ('', '.', '..') for part in path.split('/'))):
            raise ApiError(403, 'attachment_not_owned')
        size = item.get('sizeBytes')
        if size is not None and (not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= 52428800):
            raise ApiError(400, 'invalid_attachments')
        result.append(item)
    return result


class DirectMessagingApi:
    def __init__(self, auth=None, db=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = self.auth.resolve(authorization)

        if method == 'GET' and parsed.path == '/v1/direct/conversations':
            if parsed.query:
                raise ApiError(400, 'invalid_query')
            return 200, {'items': [_conversation(row) for row in _rows(self.db, user_id, 'get_my_direct_conversations')]}

        if method == 'POST' and parsed.path == '/v1/direct/conversations/start':
            value = _object(body, ('targetUserId',), 'invalid_start')
            row = _row(self.db, user_id, 'start_or_get_direct_conversation', "'%s'::uuid" % valid_uuid(value['targetUserId']))
            if row is None:
                raise ApiError(503, 'direct_start_failed')
            return 200, {'ok': bool(row.get('ok')), 'conversationId': row.get('conversation_id'),
                         'status': row.get('status'), 'requiresRequest': bool(row.get('requires_request')),
                         'message': row.get('message')}

        if method == 'POST' and parsed.path == '/v1/direct/conversations/start-with-message':
            value = _object(body, ('targetUserId', 'body'), 'invalid_start')
            args = "'%s'::uuid,%s" % (valid_uuid(value['targetUserId']), sql_text(_text(value['body'])))
            row = _row(self.db, user_id, 'start_direct_conversation_with_message', args)
            if row is None:
                raise ApiError(503, 'direct_start_failed')
            return 200, {'ok': bool(row.get('ok')), 'conversationId': row.get('conversation_id'),
                         'messageId': row.get('message_id'), 'status': row.get('status'),
                         'createdAt': row.get('created_at'), 'message': row.get('message')}

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})', parsed.path)
        if method == 'GET' and match:
            if parsed.query:
                raise ApiError(400, 'invalid_query')
            conversation_id = valid_uuid(match.group(1))
            row = _row(self.db, user_id, 'get_direct_conversation', "'%s'::uuid" % conversation_id)
            return 200, {'item': _conversation(row) if row else None}

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/messages', parsed.path)
        if match:
            conversation_id = valid_uuid(match.group(1))
            if method == 'GET':
                if parsed.query:
                    raise ApiError(400, 'invalid_query')
                rows = _rows(self.db, user_id, 'get_direct_conversation_messages', "'%s'::uuid" % conversation_id)
                return 200, {'items': [_message(row) for row in rows]}
            if method == 'POST':
                value = _object(body, ('body',), 'invalid_message')
                row = _row(self.db, user_id, 'send_direct_message', "'%s'::uuid,%s" %
                           (conversation_id, sql_text(_text(value['body']))))
                return 200, _send_result(row, conversation_id)

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/voice', parsed.path)
        if method == 'POST' and match:
            conversation_id = valid_uuid(match.group(1))
            value = _object(body, ('audioStoragePath', 'audioMimeType', 'audioDurationMs', 'audioSizeBytes'), 'invalid_voice')
            path = value['audioStoragePath']
            if (not isinstance(path, str) or not path.startswith('direct/%s/%s/' % (conversation_id, user_id)) or
                    '/' in path[len('direct/%s/%s/' % (conversation_id, user_id)):] or len(path) > 1024):
                raise ApiError(403, 'voice_not_owned')
            mime, duration, size = value['audioMimeType'], value['audioDurationMs'], value['audioSizeBytes']
            if mime not in ('audio/m4a','audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/webm','audio/ogg'):
                raise ApiError(400, 'invalid_voice')
            if not isinstance(duration, int) or isinstance(duration, bool) or not 500 <= duration <= 120000:
                raise ApiError(400, 'invalid_voice')
            if size is not None and (not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= 15728640):
                raise ApiError(400, 'invalid_voice')
            args = "'%s'::uuid,%s,%s,%d,'رسالة صوتية',%s" % (conversation_id, sql_text(path),
                    sql_text(mime), duration, str(size) if size is not None else 'NULL')
            row = _row(self.db, user_id, 'send_direct_voice_message', args)
            result = _send_result(row, conversation_id)
            result.pop('conversationId', None)
            return 200, result

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/(accept|ignore)', parsed.path)
        if method == 'POST' and match:
            if body != {}:
                raise ApiError(400, 'invalid_request_action')
            function = 'accept_direct_message_request' if match.group(2) == 'accept' else 'ignore_direct_message_request'
            row = _row(self.db, user_id, function, "'%s'::uuid" % valid_uuid(match.group(1)))
            return 200, {'ok': bool(row and row.get('ok')), 'message': row.get('message') if row else None}

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/read', parsed.path)
        if method == 'POST' and match:
            if body != {}:
                raise ApiError(400, 'invalid_read')
            row = _row(self.db, user_id, 'mark_direct_conversation_read_v2', "'%s'::uuid" % valid_uuid(match.group(1)))
            return 200, {'ok': bool(row and row.get('ok')), 'readAt': row.get('read_at') if row else None}

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/native', parsed.path)
        if match:
            conversation_id = valid_uuid(match.group(1))
            if method == 'GET':
                query = parse_qs(parsed.query, keep_blank_values=True)
                if any(len(v) != 1 for v in query.values()) or set(query) - {'limit', 'before'}:
                    raise ApiError(400, 'invalid_query')
                try:
                    limit = int(query.get('limit', ['100'])[0])
                except ValueError:
                    raise ApiError(400, 'invalid_limit')
                if not 1 <= limit <= 200:
                    raise ApiError(400, 'invalid_limit')
                before = query.get('before', [None])[0]
                before_sql = sql_text(before) + '::timestamptz' if before else 'NULL'
                rows = _rows(self.db, user_id, 'get_direct_native_messages',
                             "'%s'::uuid,%d,%s" % (conversation_id, limit, before_sql))
                return 200, {'items': [_native_message(row) for row in reversed(rows)]}
            if method == 'POST':
                value = _object(body, ('body','replyToMessageId','attachments','metadata'), 'invalid_native_message')
                message = _text(value['body'], required=False)
                reply = "'%s'::uuid" % valid_uuid(value['replyToMessageId']) if value['replyToMessageId'] else 'NULL'
                attachments = _validate_attachments(value['attachments'], conversation_id, user_id)
                metadata = value['metadata']
                if not isinstance(metadata, dict) or len(str(metadata)) > 8192:
                    raise ApiError(400, 'invalid_metadata')
                args = "'%s'::uuid,%s,%s,%s,%s" % (conversation_id,
                    sql_text(message) if message else 'NULL', reply, json_expr(attachments), json_expr(metadata))
                row = _row(self.db, user_id, 'send_direct_native_message', args)
                result = _send_result(row, conversation_id)
                result.pop('conversationId', None)
                return 200, result

        match = re.fullmatch(r'/v1/direct/conversations/([0-9a-fA-F-]{36})/typing', parsed.path)
        if match:
            conversation_id = valid_uuid(match.group(1))
            if method == 'GET':
                if parsed.query:
                    raise ApiError(400, 'invalid_query')
                statement = "SELECT coalesce(json_agg(x.user_id),'[]'::json) FROM (SELECT user_id FROM public.direct_typing_state WHERE conversation_id='%s'::uuid AND is_typing=true AND expires_at>now() AND user_id<>'%s'::uuid ORDER BY user_id) x" % (conversation_id, user_id)
                value = self.db.query(user_id, statement)
                return 200, {'userIds': value if isinstance(value, list) else []}
            if method == 'POST':
                value = _object(body, ('isTyping',), 'invalid_typing')
                if not isinstance(value['isTyping'], bool):
                    raise ApiError(400, 'invalid_typing')
                result = self.db.query(user_id, "SELECT json_build_object('ok',public.set_direct_typing_state_v2('%s'::uuid,%s))" %
                                       (conversation_id, 'true' if value['isTyping'] else 'false'))
                return 200, {'ok': bool(result.get('ok'))}

        match = re.fullmatch(r'/v1/direct/messages/([0-9a-fA-F-]{36})/(reaction|delete)', parsed.path)
        if method == 'POST' and match:
            message_id = valid_uuid(match.group(1))
            if match.group(2) == 'reaction':
                value = _object(body, ('reaction',), 'invalid_reaction')
                if value['reaction'] not in ('love', 'thumbs_up'):
                    raise ApiError(400, 'invalid_reaction')
                row = _row(self.db, user_id, 'toggle_direct_message_reaction_v2',
                           "'%s'::uuid,%s" % (message_id, sql_text(value['reaction'])))
                return 200, {'ok': bool(row and row.get('ok')), 'enabled': bool(row and row.get('enabled')),
                             'count': int((row or {}).get('reaction_count') or 0)}
            if body != {}:
                raise ApiError(400, 'invalid_delete')
            row = _row(self.db, user_id, 'delete_direct_message_v2', "'%s'::uuid" % message_id)
            paths = row.get('storage_paths') if row and isinstance(row.get('storage_paths'), list) else []
            return 200, {'ok': bool(row and row.get('ok')), 'storagePaths': paths}

        raise ApiError(404, 'not_found')


def _send_result(row, conversation_id):
    if row is None:
        raise ApiError(503, 'direct_send_failed')
    return {'ok': bool(row.get('ok')), 'message': row.get('message'), 'messageId': row.get('message_id'),
            'conversationId': row.get('conversation_id') or conversation_id, 'createdAt': row.get('created_at')}
