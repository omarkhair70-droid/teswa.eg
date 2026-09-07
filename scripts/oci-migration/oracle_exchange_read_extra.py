"""Additional authenticated, read-only Exchange queries for the OCI rehearsal.

The caller supplies the identity resolved by Oracle Auth. All SQL runs through
PgReadRunner's restricted role, transaction-local identity and read-only transaction.
No production source access or deployment is performed here.
"""
from __future__ import annotations

from datetime import datetime, timezone
import re

from oracle_domain_read import ApiError, integer, sql_text, valid_uuid

UUID_PATH = r'([0-9a-fA-F-]{36})'
PARTICIPANT = "(d.requester_id='%s'::uuid OR d.offerer_id='%s'::uuid)"


def require_query(args, allowed):
    if set(args) - set(allowed) or any(len(values) != 1 for values in args.values()):
        raise ApiError(400, 'invalid_query')


def require_actor(args, user_id):
    if 'userId' in args and valid_uuid(args['userId'][0]) != user_id:
        raise ApiError(403, 'actor_mismatch')


def count_result(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ApiError(503, 'domain_query_failed')
    return value


def page_result(value, limit):
    if not isinstance(value, dict) or not isinstance(value.get('items'), list):
        raise ApiError(503, 'domain_query_failed')
    rows = value['items']
    if len(rows) > limit + 1:
        raise ApiError(503, 'domain_query_failed')
    return {'items': rows[:limit], 'hasMore': len(rows) > limit}


def item_validation_sql(item_id):
    return """SELECT row_to_json(x) FROM (
      SELECT i.id,i.title,i.owner_id AS "ownerId",i.status
      FROM public.items i WHERE i.id='%s'::uuid) x""" % valid_uuid(item_id)


def owned_active_ids_sql(user_id, limit, offset):
    return """SELECT json_build_object('items',coalesce(json_agg(row_to_json(x) ORDER BY x."createdAt" DESC,x.id DESC),'[]'::json),
      'hasMore',count(*)>%d) FROM (
      SELECT i.id,i.created_at AS "createdAt" FROM public.items i
      WHERE i.owner_id='%s'::uuid AND i.status='active'::public.item_status
      ORDER BY i.created_at DESC,i.id DESC LIMIT %d OFFSET %d) x""" % (
        limit, valid_uuid(user_id), limit + 1, offset)


def inbox_sql(user_id, limit, offset):
    user_id = valid_uuid(user_id)
    return """SELECT json_build_object('items',coalesce(json_agg(row_to_json(x) ORDER BY x."lastActivityAt" DESC,x."dealId" DESC),'[]'::json),
      'hasMore',count(*)>%d) FROM (
      SELECT d.id AS "dealId",d.status,d.created_at AS "createdAt",
        d.requested_item_id AS "requestedItemId",d.offered_item_id AS "offeredItemId",
        json_build_object('id',other.id,'displayName',p.display_name,'avatarUrl',p.avatar_url) AS "otherParticipant",
        CASE WHEN lm.id IS NULL THEN NULL ELSE json_build_object('body',lm.body,'createdAt',lm.created_at,
          'senderId',lm.sender_id,'messageType',lm.message_type) END AS "latestMessage",
        (SELECT count(*)::integer FROM public.deal_messages m
          LEFT JOIN public.deal_message_reads r ON r.deal_id=d.id AND r.user_id='%s'::uuid
          WHERE m.deal_id=d.id AND m.sender_id<>'%s'::uuid
            AND (r.last_read_at IS NULL OR m.created_at>r.last_read_at)) AS "unreadCount",
        coalesce(lm.created_at,d.created_at,'1970-01-01T00:00:00Z'::timestamptz) AS "lastActivityAt"
      FROM public.swap_deals d
      CROSS JOIN LATERAL (SELECT CASE WHEN d.requester_id='%s'::uuid THEN d.offerer_id ELSE d.requester_id END AS id) other
      LEFT JOIN public.profiles p ON p.id=other.id
      LEFT JOIN LATERAL (SELECT m.id,m.body,m.created_at,m.sender_id,m.message_type
        FROM public.deal_messages m WHERE m.deal_id=d.id
        ORDER BY m.created_at DESC,m.id DESC LIMIT 1) lm ON true
      WHERE %s
      ORDER BY coalesce(lm.created_at,d.created_at) DESC NULLS LAST,d.id DESC
      LIMIT %d OFFSET %d) x""" % (
        limit, user_id, user_id, user_id, PARTICIPANT % (user_id, user_id), limit + 1, offset)


def confirmations_sql(user_id, deal_id):
    return """SELECT coalesce(json_agg(c.user_id ORDER BY c.user_id),'[]'::json)
      FROM public.deal_confirmations c JOIN public.swap_deals d ON d.id=c.deal_id
      WHERE d.id='%s'::uuid AND %s""" % (valid_uuid(deal_id), PARTICIPANT % (user_id, user_id))


def review_sql(user_id, deal_id, reviewer_id):
    return """SELECT EXISTS(SELECT 1 FROM public.reviews r
      JOIN public.swap_deals d ON d.id=r.deal_id
      WHERE d.id='%s'::uuid AND r.reviewer_id='%s'::uuid AND %s)""" % (
        valid_uuid(deal_id), valid_uuid(reviewer_id), PARTICIPANT % (user_id, user_id))


def message_count_sql(user_id, deal_id, sender_id, since):
    return """SELECT count(*)::integer FROM public.deal_messages m
      JOIN public.swap_deals d ON d.id=m.deal_id
      WHERE d.id='%s'::uuid AND m.sender_id='%s'::uuid
      AND m.created_at>=%s::timestamptz AND %s""" % (
        valid_uuid(deal_id), valid_uuid(sender_id), sql_text(since), PARTICIPANT % (user_id, user_id))


def valid_since(value):
    if not isinstance(value, str) or len(value) > 64:
        raise ApiError(400, 'invalid_since')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError('timezone required')
        return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError):
        raise ApiError(400, 'invalid_since')


def handle_extra(parsed, args, user_id, db):
    """Return a handled response, or None for an endpoint owned by the base API."""
    path = parsed.path
    if path == '/v1/offers/owned-active-items':
        require_query(args, ('userId', 'limit', 'offset'))
        require_actor(args, user_id)
        limit = integer(args.get('limit', [None])[0], 20, 50)
        offset = integer(args.get('offset', [None])[0], 0, 10000)
        if limit < 1:
            raise ApiError(400, 'invalid_pagination')
        return 200, page_result(db.query(user_id, owned_active_ids_sql(user_id, limit, offset)), limit)
    match = re.fullmatch(r'/v1/offers/items/' + UUID_PATH, path)
    if match:
        require_query(args, ())
        row = db.query(user_id, item_validation_sql(match.group(1)))
        if row is None:
            raise ApiError(404, 'not_found')
        if not isinstance(row, dict) or row.get('id') != valid_uuid(match.group(1)):
            raise ApiError(503, 'domain_query_failed')
        return 200, row
    if path == '/v1/deals/unread-count':
        require_query(args, ())
        count = count_result(db.query(user_id, 'SELECT public.get_unread_deal_messages_count()'))
        return 200, {'count': count}
    if path == '/v1/deals/inbox':
        require_query(args, ('userId', 'limit', 'offset'))
        require_actor(args, user_id)
        limit = integer(args.get('limit', [None])[0], 20, 50)
        offset = integer(args.get('offset', [None])[0], 0, 10000)
        if limit < 1:
            raise ApiError(400, 'invalid_pagination')
        return 200, page_result(db.query(user_id, inbox_sql(user_id, limit, offset)), limit)
    match = re.fullmatch(r'/v1/deals/' + UUID_PATH + r'/confirmations', path)
    if match:
        require_query(args, ())
        result = db.query(user_id, confirmations_sql(user_id, match.group(1)))
        if not isinstance(result, list) or any(not isinstance(value, str) for value in result):
            raise ApiError(503, 'domain_query_failed')
        return 200, {'userIds': result}
    match = re.fullmatch(r'/v1/deals/' + UUID_PATH + r'/reviews', path)
    if match:
        require_query(args, ('reviewerId',))
        reviewer_id = args.get('reviewerId', [None])[0]
        result = db.query(user_id, review_sql(user_id, match.group(1), reviewer_id))
        if not isinstance(result, bool):
            raise ApiError(503, 'domain_query_failed')
        return 200, {'hasReview': result}
    match = re.fullmatch(r'/v1/deals/' + UUID_PATH + r'/messages/count', path)
    if match:
        require_query(args, ('senderId', 'since'))
        sender_id = args.get('senderId', [None])[0]
        since = valid_since(args.get('since', [None])[0])
        result = db.query(user_id, message_count_sql(user_id, match.group(1), sender_id, since))
        return 200, {'count': count_result(result)}
    return None
