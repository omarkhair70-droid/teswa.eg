"""Atomic owned-image metadata updates. Storage deletion remains a separate client step."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, valid_uuid
from oracle_marketplace_write import PgWriteRunner, json_expr
from oracle_media import OciStorage, object_input

MAX_IMAGES = 8


def normalize_plan(body, item_id, user_id):
    if not isinstance(body, dict) or set(body) != {'itemId', 'ownerId', 'orderedRows'}:
        raise ApiError(400, 'invalid_image_plan')
    if valid_uuid(body['itemId']) != item_id or valid_uuid(body['ownerId']) != user_id:
        raise ApiError(403, 'actor_mismatch')
    rows = body['orderedRows']
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_IMAGES:
        raise ApiError(400, 'invalid_image_plan')
    normalized, seen_ids, seen_urls, seen_keys = [], set(), set(), set()
    for row in rows:
        if not isinstance(row, dict) or row.get('kind') not in ('existing', 'new'):
            raise ApiError(400, 'invalid_image_plan')
        kind = row['kind']
        if set(row) != ({'kind', 'imageId', 'imageUrl'} if kind == 'existing' else {'kind', 'imageUrl'}):
            raise ApiError(400, 'invalid_image_plan')
        url = row['imageUrl']
        if not isinstance(url, str) or not url or len(url) > 4096 or url != url.strip() or url in seen_urls:
            raise ApiError(400, 'invalid_image_plan')
        seen_urls.add(url)
        if kind == 'existing':
            image_id = valid_uuid(row['imageId'])
            if image_id in seen_ids:
                raise ApiError(400, 'invalid_image_plan')
            seen_ids.add(image_id)
            normalized.append({'kind': kind, 'imageId': image_id, 'imageUrl': url})
        else:
            parsed = urlsplit(url)
            marker = 'teswa-object=item_image:'
            if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or not parsed.fragment.startswith(marker):
                raise ApiError(400, 'invalid_image_plan')
            key = parsed.fragment[len(marker):]
            object_input({'purpose': 'item_image', 'objectKey': key, 'contentType': None, 'sizeBytes': None}, user_id, False)
            if key in seen_keys:
                raise ApiError(400, 'invalid_image_plan')
            seen_keys.add(key)
            normalized.append({'kind': kind, 'imageUrl': url, '_objectKey': key})
    return {'itemId': item_id, 'ownerId': user_id, 'orderedRows': normalized}


class MarketplaceImagePlanApi:
    def __init__(self, auth=None, reads=None, writes=None, storage=None):
        self.auth = auth or AuthResolver()
        self.reads = reads or PgReadRunner()
        self.writes = writes or PgWriteRunner()
        self.storage = storage

    def store(self):
        if self.storage is None:
            self.storage = OciStorage()
        return self.storage

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            raise ApiError(400, 'invalid_path')
        match = re.fullmatch(r'/v1/marketplace/items/([0-9a-fA-F-]{36})/edit/images/plan', parsed.path)
        if not match:
            raise ApiError(404, 'not_found')
        if method != 'POST':
            raise ApiError(405, 'method_not_allowed')
        item_id = valid_uuid(match.group(1))
        user_id = self.auth.resolve(authorization)
        value = normalize_plan(body, item_id, user_id)
        # Reject non-owners before issuing any new public read grants.
        owned = self.reads.query(user_id, "SELECT json_build_object('status',i.status) FROM public.items i WHERE i.id='%s'::uuid AND i.owner_id='%s'::uuid" % (item_id, user_id))
        if owned is None:
            return 200, {'ok': False, 'code': 'not_found_or_unauthorized'}
        if not isinstance(owned, dict) or owned.get('status') not in ('active', 'archived', 'reserved', 'swapped'):
            raise ApiError(503, 'invalid_listing_response')
        if owned['status'] not in ('active', 'archived'):
            return 200, {'ok': False, 'code': 'not_editable'}
        # The client URL is not an authority: resolve its owner-scoped object key,
        # verify the object exists, and mint a fresh URL from OCI itself.
        for row in value['orderedRows']:
            if row['kind'] != 'new':
                continue
            key = row.pop('_objectKey')
            found = self.store().head('item-images/' + key)
            if found is None:
                raise ApiError(404, 'media_not_found')
            if not isinstance(found.get('sizeBytes'), int) or found['sizeBytes'] < 1 or not isinstance(found.get('contentType'), str) or not found['contentType'].startswith('image/'):
                raise ApiError(409, 'invalid_image_object')
            url = self.store().par('item-images/' + key, 'ObjectRead', 10 * 365 * 24 * 3600, 'public')
            if not isinstance(url, str) or not url.startswith('https://'):
                raise ApiError(503, 'media_storage_unavailable')
            row['imageUrl'] = url + '#teswa-object=item_image:' + key
        result = self.writes.query(user_id, "SELECT teswa_runtime.apply_owned_listing_image_plan(%s)" % json_expr(value))
        if not isinstance(result, dict) or result.get('code') not in ('updated', 'invalid_input', 'not_found_or_unauthorized', 'not_editable'):
            raise ApiError(503, 'invalid_image_plan_response')
        code = result['code']
        if code == 'updated':
            removed = result.get('removedImageUrls')
            if not isinstance(removed, list) or any(not isinstance(url, str) for url in removed):
                raise ApiError(503, 'invalid_image_plan_response')
            return 200, {'ok': True, 'code': code, 'removedImageUrls': removed}
        return 200, {'ok': False, 'code': code}
