"""Authenticated Oracle Dolab API backed by migrated tables and RLS."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner

ITEM_STATUSES = ('draft', 'ready')
ITEM_SOURCES = ('manual', 'camera', 'gallery', 'share_intent', 'note', 'voice')
MEDIA_TYPES = ('image', 'video', 'audio')
NOTE_TYPES = ('text', 'voice', 'idea', 'checklist')


def exact(value, keys, code):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ApiError(400, code)
    return value


def actor(value, user_id):
    if valid_uuid(value) != user_id:
        raise ApiError(403, 'actor_mismatch')


def optional_uuid(value):
    return valid_uuid(value) if value is not None else None


def optional_text(value, maximum, code='invalid_text'):
    if value is None:
        return None
    if not isinstance(value, str) or len(value.strip()) > maximum:
        raise ApiError(400, code)
    return value.strip() or None


def sql_nullable(value):
    return sql_text(value) if value is not None else 'NULL'


def owned_storage_path(value, user_id):
    if (not isinstance(value, str) or not value.startswith(user_id + '/') or
            len(value) > 1024 or '\\' in value or
            any(part in ('', '.', '..') for part in value.split('/'))):
        raise ApiError(403, 'dolab_media_not_owned')
    return value


def item_input(value):
    value = exact(value, ('title', 'description', 'category', 'condition', 'exchangeIntent', 'status', 'source'),
                  'invalid_dolab_item')
    if value['status'] not in ITEM_STATUSES or value['source'] not in ITEM_SOURCES:
        raise ApiError(400, 'invalid_dolab_item')
    return {
        'title': optional_text(value['title'], 160),
        'description': optional_text(value['description'], 4000),
        'category': optional_text(value['category'], 120),
        'condition': optional_text(value['condition'], 120),
        'exchange_intent': optional_text(value['exchangeIntent'], 1000),
        'status': value['status'],
        'source': value['source'],
    }


def item_assignments(value):
    return ','.join('%s=%s' % (key, sql_nullable(entry)) for key, entry in value.items())


def one_query(parsed, user_id):
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) != {'userId'} or len(query['userId']) != 1:
        raise ApiError(400, 'invalid_query')
    actor(query['userId'][0], user_id)


class DolabApi:
    def __init__(self, auth=None, db=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = self.auth.resolve(authorization)

        if method == 'GET' and parsed.path in ('/v1/dolab/items', '/v1/dolab/media', '/v1/dolab/notes'):
            one_query(parsed, user_id)
            table = parsed.path.rsplit('/', 1)[1]
            table = {'items': 'dolab_items', 'media': 'dolab_media', 'notes': 'dolab_notes'}[table]
            result = self.db.query(user_id, "SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.created_at DESC,x.id),'[]'::json) FROM public.%s x WHERE x.user_id='%s'::uuid" % (table, user_id))
            return 200, {'items': result if isinstance(result, list) else []}

        if method == 'POST' and parsed.path == '/v1/dolab/items':
            value = exact(body, ('userId', 'input'), 'invalid_dolab_item')
            actor(value['userId'], user_id)
            item = item_input(value['input'])
            statement = """WITH x AS (INSERT INTO public.dolab_items(user_id,title,description,category,condition,exchange_intent,status,source)
              VALUES('%s'::uuid,%s,%s,%s,%s,%s,%s,%s) RETURNING *) SELECT row_to_json(x) FROM x""" % (
                user_id, sql_nullable(item['title']), sql_nullable(item['description']), sql_nullable(item['category']),
                sql_nullable(item['condition']), sql_nullable(item['exchange_intent']), sql_text(item['status']), sql_text(item['source']))
            result = self.db.query(user_id, statement)
            if not isinstance(result, dict) or not result.get('id'):
                raise ApiError(409, 'dolab_item_create_rejected')
            return 201, {'item': result}

        match = re.fullmatch(r'/v1/dolab/items/([0-9a-fA-F-]{36})/(update|delete|published)', parsed.path)
        if method == 'POST' and match:
            item_id = valid_uuid(match.group(1)); action = match.group(2)
            if action == 'update':
                value = exact(body, ('userId', 'input'), 'invalid_dolab_item'); actor(value['userId'], user_id)
                statement = "WITH x AS (UPDATE public.dolab_items SET %s WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING *) SELECT (SELECT row_to_json(x) FROM x)" % (item_assignments(item_input(value['input'])), item_id, user_id)
                return 200, {'item': self.db.query(user_id, statement)}
            if action == 'delete':
                value = exact(body, ('userId',), 'invalid_delete'); actor(value['userId'], user_id)
                result = self.db.query(user_id, "WITH x AS (DELETE FROM public.dolab_items WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',true)" % (item_id, user_id))
                return 200, {'ok': bool(result and result.get('ok'))}
            value = exact(body, ('userId', 'publishedItemId'), 'invalid_publish_link'); actor(value['userId'], user_id)
            published = valid_uuid(value['publishedItemId'])
            result = self.db.query(user_id, "WITH x AS (UPDATE public.dolab_items SET status='published',published_item_id='%s'::uuid WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING *) SELECT (SELECT row_to_json(x) FROM x)" % (published, item_id, user_id))
            return 200, {'item': result}

        match = re.fullmatch(r'/v1/dolab/items/([0-9a-fA-F-]{36})/publish-source', parsed.path)
        if method == 'GET' and match:
            one_query(parsed, user_id); item_id = valid_uuid(match.group(1))
            statement = """SELECT json_build_object('item',(SELECT row_to_json(i) FROM public.dolab_items i WHERE i.id='%s'::uuid AND i.user_id='%s'::uuid),
              'media',coalesce((SELECT json_agg(row_to_json(m) ORDER BY m.sort_order,m.created_at,m.id) FROM public.dolab_media m
              WHERE m.dolab_item_id='%s'::uuid AND m.user_id='%s'::uuid),'[]'::json))""" % (item_id, user_id, item_id, user_id)
            result = self.db.query(user_id, statement)
            return 200, result if isinstance(result, dict) else {'item': None, 'media': []}

        if method == 'POST' and parsed.path == '/v1/dolab/notes':
            value = exact(body, ('userId', 'body', 'noteType', 'dolabItemId', 'mediaId'), 'invalid_dolab_note')
            actor(value['userId'], user_id)
            if value['noteType'] not in NOTE_TYPES: raise ApiError(400, 'invalid_dolab_note')
            note_body = optional_text(value['body'], 8000); item_id = optional_uuid(value['dolabItemId']); media_id = optional_uuid(value['mediaId'])
            statement = """WITH x AS (INSERT INTO public.dolab_notes(user_id,body,note_type,dolab_item_id,media_id)
              VALUES('%s'::uuid,%s,%s,%s,%s) RETURNING *) SELECT row_to_json(x) FROM x""" % (
                user_id, sql_nullable(note_body), sql_text(value['noteType']), "'%s'::uuid" % item_id if item_id else 'NULL', "'%s'::uuid" % media_id if media_id else 'NULL')
            result = self.db.query(user_id, statement)
            if not isinstance(result, dict) or not result.get('id'): raise ApiError(409, 'dolab_note_create_rejected')
            return 201, {'note': result}

        match = re.fullmatch(r'/v1/dolab/notes/([0-9a-fA-F-]{36})/(delete|shared|media)', parsed.path)
        if method == 'POST' and match:
            note_id = valid_uuid(match.group(1)); action = match.group(2)
            if action == 'delete':
                value = exact(body, ('userId',), 'invalid_delete'); actor(value['userId'], user_id)
                sql = "WITH x AS (DELETE FROM public.dolab_notes WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',true)" % (note_id, user_id)
            else:
                key = 'conversationId' if action == 'shared' else 'mediaId'
                value = exact(body, ('userId', key), 'invalid_dolab_link'); actor(value['userId'], user_id); linked = valid_uuid(value[key])
                column = 'shared_to_conversation_id' if action == 'shared' else 'media_id'
                sql = "WITH x AS (UPDATE public.dolab_notes SET %s='%s'::uuid WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',true)" % (column, linked, note_id, user_id)
            result = self.db.query(user_id, sql); return 200, {'ok': bool(result and result.get('ok'))}

        if method == 'POST' and parsed.path == '/v1/dolab/media':
            value = exact(body, ('userId', 'input'), 'invalid_dolab_media'); actor(value['userId'], user_id)
            media = exact(value['input'], ('dolabItemId','mediaType','storagePath','durationMs','width','height','mimeType','sizeBytes','sortOrder'), 'invalid_dolab_media')
            if media['mediaType'] not in MEDIA_TYPES: raise ApiError(400, 'invalid_dolab_media')
            path = owned_storage_path(media['storagePath'], user_id); item_id = optional_uuid(media['dolabItemId'])
            numbers = {}
            for key, maximum in (('durationMs', 86400000), ('width', 20000), ('height', 20000), ('sizeBytes', 1073741824), ('sortOrder', 10000)):
                entry = media[key]
                if (key == 'sortOrder' and entry is None) or (entry is not None and (not isinstance(entry, int) or isinstance(entry, bool) or entry < 0 or entry > maximum)): raise ApiError(400, 'invalid_dolab_media')
                numbers[key] = entry
            mime = optional_text(media['mimeType'], 255)
            statement = """WITH x AS (INSERT INTO public.dolab_media(user_id,dolab_item_id,media_type,storage_path,thumbnail_path,duration_ms,width,height,mime_type,size_bytes,sort_order)
              VALUES('%s'::uuid,%s,%s,%s,NULL,%s,%s,%s,%s,%s,%s) RETURNING *) SELECT row_to_json(x) FROM x""" % (
                user_id, "'%s'::uuid" % item_id if item_id else 'NULL', sql_text(media['mediaType']), sql_text(path),
                numbers['durationMs'] if numbers['durationMs'] is not None else 'NULL', numbers['width'] if numbers['width'] is not None else 'NULL',
                numbers['height'] if numbers['height'] is not None else 'NULL', sql_nullable(mime), numbers['sizeBytes'] if numbers['sizeBytes'] is not None else 'NULL', numbers['sortOrder'])
            result = self.db.query(user_id, statement)
            if not isinstance(result, dict) or not result.get('id'): raise ApiError(409, 'dolab_media_create_rejected')
            return 201, {'media': result}

        match = re.fullmatch(r'/v1/dolab/media/([0-9a-fA-F-]{36})/(delete|attach)', parsed.path)
        if method == 'POST' and match:
            media_id = valid_uuid(match.group(1)); action = match.group(2)
            if action == 'delete':
                value = exact(body, ('userId',), 'invalid_delete'); actor(value['userId'], user_id)
                result = self.db.query(user_id, "WITH x AS (DELETE FROM public.dolab_media WHERE id='%s'::uuid AND user_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',true)" % (media_id, user_id))
                return 200, {'ok': bool(result and result.get('ok'))}
            value = exact(body, ('userId', 'dolabItemId'), 'invalid_dolab_link'); actor(value['userId'], user_id); item_id = valid_uuid(value['dolabItemId'])
            statement = """WITH existing AS (SELECT dolab_item_id FROM public.dolab_media WHERE id='%s'::uuid AND user_id='%s'::uuid),
              changed AS (UPDATE public.dolab_media SET dolab_item_id='%s'::uuid WHERE id='%s'::uuid AND user_id='%s'::uuid AND dolab_item_id IS NULL RETURNING 1)
              SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM existing) THEN json_build_object('state','not_found')
                WHEN EXISTS(SELECT 1 FROM existing WHERE dolab_item_id='%s'::uuid) THEN json_build_object('state','already_linked')
                WHEN EXISTS(SELECT 1 FROM existing WHERE dolab_item_id IS NOT NULL) THEN json_build_object('state','linked_elsewhere')
                WHEN EXISTS(SELECT 1 FROM changed) THEN json_build_object('state','linked') ELSE json_build_object('state','not_found') END""" % (media_id, user_id, item_id, media_id, user_id, item_id)
            result = self.db.query(user_id, statement)
            if not isinstance(result, dict) or result.get('state') == 'not_found': raise ApiError(404, 'not_found')
            if result.get('state') not in ('linked', 'already_linked', 'linked_elsewhere'): raise ApiError(409, 'dolab_media_link_rejected')
            return 200, result

        raise ApiError(404, 'not_found')
