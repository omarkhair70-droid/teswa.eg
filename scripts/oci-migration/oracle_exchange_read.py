"""Read-only offer and deal endpoints. No production routing or source writes."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, integer, valid_uuid

UUID_PATH = r'([0-9a-fA-F-]{36})'


def offer_sql(user_id, offer_id=None, direction=None, limit=50, offset=0):
    if direction not in (None, 'incoming', 'sent'):
        raise ApiError(400, 'invalid_direction')
    where = ["(o.sender_id='%s'::uuid OR o.receiver_id='%s'::uuid)" % (user_id, user_id)]
    if offer_id:
        where.append("o.id='%s'::uuid" % valid_uuid(offer_id))
    if direction:
        column = 'receiver_id' if direction == 'incoming' else 'sender_id'
        where.append("o.%s='%s'::uuid" % (column, user_id))
    source = """public.offers o LEFT JOIN LATERAL (
        SELECT d.id FROM public.swap_deals d WHERE d.offer_id=o.id
        AND (d.requester_id='%s'::uuid OR d.offerer_id='%s'::uuid)
        ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) latest ON true""" % (user_id, user_id)
    columns = """o.id,o.sender_id AS \"senderId\",o.receiver_id AS \"receiverId\",
        o.requested_item_id AS \"requestedItemId\",o.offered_item_id AS \"offeredItemId\",
        o.status,o.message,latest.id AS \"dealId\",o.created_at AS \"createdAt\""" 
    if offer_id:
        return "SELECT row_to_json(x) FROM (SELECT %s FROM %s WHERE %s) x" % (columns, source, ' AND '.join(where))
    return """SELECT json_build_object('items',coalesce(json_agg(row_to_json(x)),'[]'::json),
        'hasMore',count(*)>%d) FROM (SELECT %s FROM %s WHERE %s
        ORDER BY o.created_at DESC,o.id DESC LIMIT %d OFFSET %d) x""" % (
        limit, columns, source, ' AND '.join(where), limit + 1, offset)


def deal_sql(user_id, deal_id):
    return """SELECT row_to_json(x) FROM (
      SELECT d.id,d.status,d.accepted_at AS \"acceptedAt\",d.created_at AS \"createdAt\",
        d.requested_item_id AS \"requestedItemId\",d.offered_item_id AS \"offeredItemId\",
        d.requester_id AS \"requesterId\",d.offerer_id AS \"offererId\"
      FROM public.swap_deals d WHERE d.id='%s'::uuid
      AND (d.requester_id='%s'::uuid OR d.offerer_id='%s'::uuid)) x""" % (deal_id, user_id, user_id)


def messages_sql(user_id, deal_id, limit, offset):
    return """SELECT json_build_object('items',coalesce(json_agg(row_to_json(x)),'[]'::json),
      'hasMore',count(*)>%d) FROM (SELECT m.id,m.deal_id AS \"dealId\",
      m.sender_id AS \"senderId\",m.body,m.message_type AS \"messageType\",
      m.audio_storage_path AS \"audioStoragePath\",m.audio_duration_ms AS \"audioDurationMs\",
      m.audio_mime_type AS \"audioMimeType\",m.audio_size_bytes AS \"audioSizeBytes\",
      m.created_at AS \"createdAt\" FROM public.deal_messages m
      WHERE m.deal_id='%s'::uuid AND EXISTS (
        SELECT 1 FROM public.swap_deals d WHERE d.id=m.deal_id
        AND (d.requester_id='%s'::uuid OR d.offerer_id='%s'::uuid))
      ORDER BY m.created_at DESC,m.id DESC LIMIT %d OFFSET %d) x""" % (
        limit, deal_id, user_id, user_id, limit + 1, offset)


class ExchangeReadApi:
    def __init__(self, auth=None, db=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgReadRunner()

    def handle(self, method, target, authorization):
        if method != 'GET':
            raise ApiError(405, 'method_not_allowed')
        parsed = urlsplit(target)
        if parsed.fragment or parsed.scheme or parsed.netloc:
            raise ApiError(400, 'invalid_path')
        args = parse_qs(parsed.query, keep_blank_values=True)
        if any(len(values) != 1 for values in args.values()):
            raise ApiError(400, 'invalid_query')
        user_id = self.auth.resolve(authorization)
        if parsed.path == '/v1/offers':
            if set(args) - {'direction', 'limit', 'offset'}:
                raise ApiError(400, 'invalid_query')
            direction = args.get('direction', ['incoming'])[0]
            if direction not in ('incoming', 'sent'):
                raise ApiError(400, 'invalid_direction')
            limit = integer(args.get('limit', [None])[0], 20, 50)
            offset = integer(args.get('offset', [None])[0], 0, 10000)
            if limit < 1:
                raise ApiError(400, 'invalid_pagination')
            result = self.db.query(user_id, offer_sql(user_id, direction=direction, limit=limit, offset=offset))
            return 200, {'items': result['items'][:limit], 'hasMore': len(result['items']) > limit}
        match = re.fullmatch(r'/v1/offers/' + UUID_PATH, parsed.path)
        if match and not parsed.query:
            row = self.db.query(user_id, offer_sql(user_id, offer_id=valid_uuid(match.group(1))))
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row
        match = re.fullmatch(r'/v1/deals/' + UUID_PATH, parsed.path)
        if match and not parsed.query:
            row = self.db.query(user_id, deal_sql(user_id, valid_uuid(match.group(1))))
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row
        match = re.fullmatch(r'/v1/deals/' + UUID_PATH + r'/messages', parsed.path)
        if match:
            if set(args) - {'limit', 'offset'}:
                raise ApiError(400, 'invalid_query')
            limit = integer(args.get('limit', [None])[0], 50, 100)
            offset = integer(args.get('offset', [None])[0], 0, 10000)
            if limit < 1:
                raise ApiError(400, 'invalid_pagination')
            result = self.db.query(user_id, messages_sql(user_id, valid_uuid(match.group(1)), limit, offset))
            return 200, {'items': result['items'][:limit], 'hasMore': len(result['items']) > limit}
        raise ApiError(404, 'not_found')
