"""Authenticated listing lifecycle and owned image metadata for Oracle.

Reuse the existing portable PostgreSQL functions; do not duplicate their
business rules or grant the client a direct DELETE on listings.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, valid_uuid
from oracle_marketplace_write import PgWriteRunner

LIFECYCLE_FUNCTIONS = {
    'archive': 'archive_owned_listing_if_safe',
    'reactivate': 'reactivate_owned_archived_listing',
    'delete-archived': 'delete_owned_archived_listing_if_safe',
}
LIFECYCLE_CODES = frozenset({
    'archived', 'reactivated', 'deleted', 'not_found_or_unauthorized',
    'not_active', 'not_archived', 'has_open_offers', 'has_deal_history',
})


class MarketplaceLifecycleApi:
    def __init__(self, auth=None, reads=None, writes=None):
        self.auth = auth or AuthResolver()
        self.reads = reads or PgReadRunner()
        self.writes = writes or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            raise ApiError(400, 'invalid_path')
        match = re.fullmatch(
            r'/v1/marketplace/items/([0-9a-fA-F-]{36})/(archive|reactivate|delete-archived|images/urls)',
            parsed.path,
        )
        if not match:
            raise ApiError(404, 'not_found')
        item_id = valid_uuid(match.group(1))
        action = match.group(2)
        if method == 'GET' and action == 'images/urls':
            if body is not None:
                raise ApiError(400, 'invalid_body')
        elif method == 'POST' and action in LIFECYCLE_FUNCTIONS:
            if body != {}:
                raise ApiError(400, 'invalid_body')
        else:
            raise ApiError(405, 'method_not_allowed')

        # The private Auth service is the identity authority. The caller cannot
        # supply an owner ID or choose a database role.
        user_id = self.auth.resolve(authorization)
        if action == 'images/urls':
            statement = """SELECT coalesce(json_agg(m.image_url ORDER BY
              m.is_primary DESC,m.sort_order NULLS LAST,m.id),'[]'::json)
              FROM public.item_images m JOIN public.items i ON i.id=m.item_id
              WHERE i.id='%s'::uuid AND i.owner_id='%s'::uuid""" % (item_id, user_id)
            rows = self.reads.query(user_id, statement)
            if not isinstance(rows, list) or any(not isinstance(url, str) for url in rows):
                raise ApiError(503, 'invalid_lifecycle_response')
            return 200, {'items': rows}

        # These functions already enforce ownership, status transitions, open
        # offers and deal-history checks. They run with the verified transaction
        # actor supplied by PgWriteRunner, never a client-provided identity.
        function = LIFECYCLE_FUNCTIONS[action]
        statement = "SELECT json_build_object('code',public.%s('%s'::uuid))" % (function, item_id)
        result = self.writes.query(user_id, statement)
        if not isinstance(result, dict) or result.get('code') not in LIFECYCLE_CODES:
            raise ApiError(503, 'invalid_lifecycle_response')
        return 200, {'code': result['code']}
