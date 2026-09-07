"""Authenticated OCI Object Storage operations for the Teswa rehearsal."""
from __future__ import annotations

import datetime
import re
import secrets
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, valid_uuid

PURPOSE_PREFIX = {
    'profile_image': 'profile-images', 'item_image': 'item-images',
    'item_video': 'item-videos', 'story_media': 'story-media',
    'direct_chat_media': 'direct-chat-media', 'direct_voice': 'direct-voice-messages',
    'deal_voice': 'deal-voice-messages', 'contextual_voice': 'contextual-voice-messages',
    'dolab_media': 'dolab-media',
}
PUBLIC_PURPOSES = {'profile_image', 'item_image'}
MAX_OBJECT_BYTES = 100 * 1024 * 1024


def object_input(value, user_id, require_size=True):
    if not isinstance(value, dict) or set(value) - {'purpose', 'objectKey', 'contentType', 'sizeBytes'}:
        raise ApiError(400, 'invalid_media_object')
    purpose, key = value.get('purpose'), value.get('objectKey')
    if purpose not in PURPOSE_PREFIX or not isinstance(key, str) or not (1 <= len(key) <= 1024):
        raise ApiError(400, 'invalid_media_object')
    if key.startswith('/') or '\\' in key or any(x in ('', '.', '..') for x in key.split('/')):
        raise ApiError(400, 'invalid_media_object')
    if any(ord(char) < 32 or ord(char) == 127 for char in key):
        raise ApiError(400, 'invalid_media_object')
    # Every current Teswa upload key carries the owner UUID as a full segment.
    # The API derives that UUID from Auth; it never trusts an ownerId body field.
    if user_id not in key.split('/'):
        raise ApiError(403, 'media_not_owned')
    content_type = value.get('contentType')
    if content_type is not None and (not isinstance(content_type, str)
                                     or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+-]*/[A-Za-z0-9][A-Za-z0-9.+-]*', content_type)):
        raise ApiError(400, 'invalid_content_type')
    size = value.get('sizeBytes')
    if require_size and (not isinstance(size, int) or isinstance(size, bool) or not (1 <= size <= MAX_OBJECT_BYTES)):
        raise ApiError(400, 'invalid_media_size')
    if not require_size and size is not None and (not isinstance(size, int) or isinstance(size, bool)
                                                  or not (1 <= size <= MAX_OBJECT_BYTES)):
        raise ApiError(400, 'invalid_media_size')
    return purpose, key, content_type, size, PURPOSE_PREFIX[purpose] + '/' + key


class OciStorage:
    def __init__(self, bucket='teswa-media'):
        try:
            import oci
            signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
            self.oci = oci
            self.client = oci.object_storage.ObjectStorageClient({}, signer=signer)
            self.namespace = self.client.get_namespace().data
            self.bucket = bucket
        except Exception:
            raise ApiError(503, 'media_storage_unavailable')

    def _url(self, response):
        uri = response.data.access_uri
        return self.client.base_client.endpoint.rstrip('/') + '/' + uri.lstrip('/')

    def head(self, name):
        try:
            result = self.client.head_object(self.namespace, self.bucket, name)
            return {'sizeBytes': int(result.headers.get('content-length', '-1')),
                    'contentType': result.headers.get('content-type')}
        except self.oci.exceptions.ServiceError as exc:
            if exc.status == 404:
                return None
            raise ApiError(503, 'media_storage_unavailable')

    def par(self, name, access_type, seconds, label):
        details = self.oci.object_storage.models.CreatePreauthenticatedRequestDetails(
            name='teswa-'+label+'-'+secrets.token_hex(12), object_name=name,
            access_type=access_type,
            time_expires=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=seconds))
        try:
            return self._url(self.client.create_preauthenticated_request(
                self.namespace, self.bucket, details))
        except self.oci.exceptions.ServiceError:
            raise ApiError(503, 'media_storage_unavailable')

    def delete(self, name):
        try:
            self.client.delete_object(self.namespace, self.bucket, name)
        except self.oci.exceptions.ServiceError as exc:
            if exc.status != 404:
                raise ApiError(503, 'media_storage_unavailable')


class MediaApi:
    def __init__(self, auth=None, storage=None):
        self.auth = auth or AuthResolver()
        self.storage = storage

    def store(self):
        if self.storage is None:
            self.storage = OciStorage()
        return self.storage

    def handle(self, method, target, authorization, body):
        parsed = urlsplit(target)
        if parsed.query or parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = valid_uuid(self.auth.resolve(authorization))
        if not isinstance(body, dict):
            raise ApiError(400, 'invalid_json_object')
        if method == 'POST' and parsed.path == '/v1/media/uploads':
            purpose, key, content_type, size, physical = object_input(body, user_id)
            if self.store().head(physical) is not None:
                raise ApiError(409, 'media_object_exists')
            url = self.store().par(physical, 'ObjectWrite', 15 * 60, 'upload')
            return 201, {'purpose': purpose, 'objectKey': key, 'contentType': content_type,
                         'sizeBytes': size, 'uploadUrl': url, 'expiresIn': 900}
        if method == 'POST' and parsed.path == '/v1/media/uploads/complete':
            purpose, key, content_type, size, physical = object_input(body, user_id)
            found = self.store().head(physical)
            if found is None:
                raise ApiError(404, 'media_not_found')
            if found['sizeBytes'] != size:
                raise ApiError(409, 'media_size_mismatch')
            public_url = None
            if purpose in PUBLIC_PURPOSES:
                public_url = self.store().par(physical, 'ObjectRead', 10 * 365 * 24 * 3600, 'public')
                public_url += '#teswa-object=' + purpose + ':' + key
            return 200, {'purpose': purpose, 'objectKey': key, 'contentType': content_type,
                         'sizeBytes': size, 'publicUrl': public_url}
        if method == 'POST' and parsed.path == '/v1/media/signed-url':
            expires = body.pop('expiresInSeconds', 3600)
            if not isinstance(expires, int) or not (60 <= expires <= 3600):
                raise ApiError(400, 'invalid_expiry')
            purpose, key, _content_type, _size, physical = object_input(body, user_id, False)
            if self.store().head(physical) is None:
                raise ApiError(404, 'media_not_found')
            return 200, {'signedUrl': self.store().par(physical, 'ObjectRead', expires, 'read'),
                         'purpose': purpose, 'objectKey': key, 'expiresIn': expires}
        if method == 'DELETE' and parsed.path == '/v1/media/objects':
            objects = body.get('objects')
            if set(body) != {'objects'} or not isinstance(objects, list) or not (1 <= len(objects) <= 20):
                raise ApiError(400, 'invalid_media_objects')
            physical = [object_input(value, user_id, False)[4] for value in objects]
            for name in physical:
                self.store().delete(name)
            return 200, {'deleted': len(physical)}
        raise ApiError(404, 'not_found')
