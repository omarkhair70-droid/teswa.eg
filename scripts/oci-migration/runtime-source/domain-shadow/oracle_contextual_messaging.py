"""Authenticated contextual story-reply messaging for the Oracle rehearsal."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner

MESSAGE_JSON = """json_build_object(
  'id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,
  'body',m.body,'messageKind',coalesce(m.message_kind,'text'),
  'mediaStoragePath',m.media_storage_path,'mediaDurationMs',m.media_duration_ms,
  'createdAt',m.created_at)"""


def _body(value, keys, code):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ApiError(400, code)
    return value


def _text(value, maximum):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ApiError(400, 'invalid_message')
    return value.strip()


def _actor(value, user_id):
    if valid_uuid(value) != user_id:
        raise ApiError(403, 'actor_mismatch')


def _message_insert(conversation_id, user_id, body, kind='text', path=None, duration=None):
    return """WITH x AS (INSERT INTO public.contextual_messages(
      conversation_id,sender_id,body,message_kind,media_storage_path,media_duration_ms)
      VALUES('%s'::uuid,'%s'::uuid,%s,%s,%s,%s)
      RETURNING *) SELECT %s FROM x m""" % (
        conversation_id, user_id, sql_text(body), sql_text(kind),
        sql_text(path) if path else 'NULL', str(duration) if duration is not None else 'NULL', MESSAGE_JSON)


def summaries_sql(user_id):
    return """SELECT coalesce(json_agg(json_build_object(
      'conversationId',c.id,'contextType','story_reply','contextEntityId',c.context_entity_id,
      'otherParticipant',json_build_object('id',other.id,'displayName',p.display_name,
        'username',p.username,'avatarUrl',p.avatar_url),
      'latestMessage',CASE WHEN latest.id IS NULL THEN NULL ELSE json_build_object(
        'id',latest.id,'body',coalesce(latest.body,CASE WHEN latest.message_kind='voice' THEN 'رسالة صوتية' ELSE '' END),
        'senderId',latest.sender_id,'createdAt',latest.created_at,'kind',latest.message_kind,
        'durationMs',latest.media_duration_ms) END,
      'unreadCount',(SELECT count(*)::integer FROM public.contextual_messages unread
        WHERE unread.conversation_id=c.id AND unread.sender_id<>'%s'::uuid
          AND (r.last_read_at IS NULL OR unread.created_at>r.last_read_at)),
      'lastActivityAt',coalesce(latest.created_at,c.updated_at,c.created_at,'epoch'::timestamptz))
      ORDER BY coalesce(latest.created_at,c.updated_at,c.created_at) DESC,c.id),'[]'::json)
      FROM public.contextual_conversations c
      CROSS JOIN LATERAL (SELECT CASE WHEN c.starter_id='%s'::uuid THEN c.recipient_id ELSE c.starter_id END id) other
      LEFT JOIN public.profiles p ON p.id=other.id
      LEFT JOIN public.contextual_message_reads r ON r.conversation_id=c.id AND r.user_id='%s'::uuid
      LEFT JOIN LATERAL (SELECT m.id,m.body,m.sender_id,m.created_at,m.message_kind,m.media_duration_ms
        FROM public.contextual_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) latest ON true
      WHERE c.context_type='story_reply' AND '%s'::uuid IN (c.starter_id,c.recipient_id)""" % (
        user_id, user_id, user_id, user_id)


def thread_sql(user_id, conversation_id):
    return """SELECT CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object(
      'id',c.id,'contextType','story_reply','contextEntityId',c.context_entity_id,
      'starterId',c.starter_id,'recipientId',c.recipient_id,
      'otherParticipant',json_build_object('id',other.id,'displayName',p.display_name,
        'username',p.username,'avatarUrl',p.avatar_url),
      'messages',coalesce((SELECT json_agg(%s ORDER BY m.created_at,m.id)
        FROM public.contextual_messages m WHERE m.conversation_id=c.id),'[]'::json)) END
      FROM public.contextual_conversations c
      CROSS JOIN LATERAL (SELECT CASE WHEN c.starter_id='%s'::uuid THEN c.recipient_id ELSE c.starter_id END id) other
      LEFT JOIN public.profiles p ON p.id=other.id
      WHERE c.id='%s'::uuid AND '%s'::uuid IN (c.starter_id,c.recipient_id)""" % (
        MESSAGE_JSON, user_id, conversation_id, user_id)


class ContextualMessagingApi:
    def __init__(self, auth=None, db=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = self.auth.resolve(authorization)

        if method == 'POST' and parsed.path == '/v1/contextual/notifications':
            value = _body(body, ('conversationId','messageId','kind'), 'invalid_notification')
            conversation_id, message_id = valid_uuid(value['conversationId']), valid_uuid(value['messageId'])
            if value['kind'] not in ('story_reply_initial','thread_message'):
                raise ApiError(400, 'invalid_notification')
            result = self.db.query(user_id, "SELECT json_build_object('ok',true,'result',public.create_contextual_message_notification('%s'::uuid,'%s'::uuid,%s))" %
                                   (conversation_id,message_id,sql_text(value['kind'])))
            return 200, {'ok': bool(result and result.get('ok'))}

        if method == 'POST' and parsed.path == '/v1/contextual/read':
            value = _body(body, ('conversationId',), 'invalid_read')
            result = self.db.query(user_id, "SELECT json_build_object('ok',true,'result',public.mark_contextual_thread_read('%s'::uuid))" % valid_uuid(value['conversationId']))
            return 200, {'ok': bool(result and result.get('ok'))}

        if method == 'GET' and parsed.path == '/v1/contextual/unread':
            if parsed.query: raise ApiError(400, 'invalid_query')
            result = self.db.query(user_id, "SELECT json_build_object('count',public.get_unread_contextual_messages_count())")
            return 200, {'count': max(0, int((result or {}).get('count') or 0))}

        match = re.fullmatch(r'/v1/contextual/stories/([0-9a-fA-F-]{36})/owner', parsed.path)
        if method == 'GET' and match:
            if parsed.query: raise ApiError(400, 'invalid_query')
            story_id = valid_uuid(match.group(1))
            result = self.db.query(user_id, "SELECT json_build_object('userId',s.user_id) FROM public.stories s WHERE s.id='%s'::uuid" % story_id)
            return 200, {'userId': result.get('userId') if isinstance(result,dict) else None}

        match = re.fullmatch(r'/v1/contextual/stories/([0-9a-fA-F-]{36})/(reply|ensure)', parsed.path)
        if method == 'POST' and match:
            story_id = valid_uuid(match.group(1))
            if match.group(2) == 'reply':
                value = _body(body, ('body',), 'invalid_reply')
                rows = self.db.query(user_id, "SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM public.create_story_reply_thread('%s'::uuid,%s) x" %
                                     (story_id,sql_text(_text(value['body'],800))))
                row = rows[0] if isinstance(rows,list) and rows else None
                if not row: raise ApiError(404, 'not_found')
                return 200, {'conversationId': row['conversation_id'], 'messageId': row['message_id']}
            if body != {}: raise ApiError(400, 'invalid_ensure')
            rows = self.db.query(user_id, "SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM public.ensure_story_reply_conversation('%s'::uuid) x" % story_id)
            row = rows[0] if isinstance(rows,list) and rows else None
            if not row: raise ApiError(404, 'not_found')
            return 200, {'conversationId': row['conversation_id']}

        if method == 'GET' and parsed.path == '/v1/contextual/conversations':
            query = parse_qs(parsed.query, keep_blank_values=True)
            if set(query) != {'userId'} or len(query['userId']) != 1: raise ApiError(400, 'invalid_query')
            _actor(query['userId'][0], user_id)
            result = self.db.query(user_id, summaries_sql(user_id))
            if not isinstance(result,list): raise ApiError(503,'contextual_read_failed')
            return 200, {'items': result}

        match = re.fullmatch(r'/v1/contextual/conversations/([0-9a-fA-F-]{36})', parsed.path)
        if method == 'GET' and match:
            if parsed.query: raise ApiError(400,'invalid_query')
            result = self.db.query(user_id, thread_sql(user_id,valid_uuid(match.group(1))))
            return 200, {'item': result}

        match = re.fullmatch(r'/v1/contextual/conversations/([0-9a-fA-F-]{36})/other', parsed.path)
        if method == 'GET' and match:
            if parsed.query: raise ApiError(400,'invalid_query')
            conversation_id=valid_uuid(match.group(1))
            result=self.db.query(user_id,"""SELECT json_build_object('userId',CASE WHEN c.starter_id='%s'::uuid THEN c.recipient_id ELSE c.starter_id END)
              FROM public.contextual_conversations c WHERE c.id='%s'::uuid AND '%s'::uuid IN(c.starter_id,c.recipient_id)""" % (user_id,conversation_id,user_id))
            return 200, {'userId': result.get('userId') if isinstance(result,dict) else None}

        match = re.fullmatch(r'/v1/contextual/conversations/([0-9a-fA-F-]{36})/messages/([0-9a-fA-F-]{36})',parsed.path)
        if method == 'GET' and match:
            if parsed.query: raise ApiError(400,'invalid_query')
            conversation_id,message_id=valid_uuid(match.group(1)),valid_uuid(match.group(2))
            result=self.db.query(user_id,"SELECT %s FROM public.contextual_messages m WHERE m.conversation_id='%s'::uuid AND m.id='%s'::uuid" % (MESSAGE_JSON,conversation_id,message_id))
            if result is None: raise ApiError(404,'not_found')
            return 200,result

        match = re.fullmatch(r'/v1/contextual/conversations/([0-9a-fA-F-]{36})/(messages|voice)',parsed.path)
        if method == 'POST' and match:
            conversation_id=valid_uuid(match.group(1))
            if match.group(2)=='messages':
                value=_body(body,('senderId','body'),'invalid_message'); _actor(value['senderId'],user_id)
                statement=_message_insert(conversation_id,user_id,_text(value['body'],1200))
            else:
                value=_body(body,('senderId','mediaStoragePath','mediaDurationMs'),'invalid_voice'); _actor(value['senderId'],user_id)
                path=value['mediaStoragePath']; prefix='contextual/%s/%s/' % (conversation_id,user_id)
                duration=value['mediaDurationMs']
                if not isinstance(path,str) or not path.startswith(prefix) or len(path)>1024 or '/' in path[len(prefix):]:
                    raise ApiError(403,'voice_not_owned')
                if not isinstance(duration,int) or isinstance(duration,bool) or not 500<=duration<=120000:
                    raise ApiError(400,'invalid_voice')
                statement=_message_insert(conversation_id,user_id,'رسالة صوتية','voice',path,duration)
            result=self.db.query(user_id,statement)
            if not isinstance(result,dict): raise ApiError(409,'contextual_send_rejected')
            return 201,result

        raise ApiError(404,'not_found')
