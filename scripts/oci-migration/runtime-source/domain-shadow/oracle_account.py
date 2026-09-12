"""Authenticated Oracle account deletion with OCI media cleanup."""
from __future__ import annotations

from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver
from oracle_marketplace_write import PgWriteRunner
from oracle_media import OciStorage


MEDIA_OBJECTS_SQL = """SELECT json_build_object('objects',coalesce(json_agg(name ORDER BY name),'[]'::json))
FROM (
  SELECT 'item-videos/'||v.video_storage_path AS name
  FROM public.item_videos v JOIN public.items i ON i.id=v.item_id
  WHERE i.owner_id='%s'::uuid AND nullif(btrim(v.video_storage_path),'') IS NOT NULL
  UNION SELECT 'story-media/'||s.media_storage_path FROM public.stories s
  WHERE s.user_id='%s'::uuid AND nullif(btrim(s.media_storage_path),'') IS NOT NULL
  UNION SELECT 'story-media/'||s.media_thumbnail_storage_path FROM public.stories s
  WHERE s.user_id='%s'::uuid AND nullif(btrim(s.media_thumbnail_storage_path),'') IS NOT NULL
  UNION SELECT 'deal-voice-messages/'||m.audio_storage_path FROM public.deal_messages m
  WHERE m.sender_id='%s'::uuid AND nullif(btrim(m.audio_storage_path),'') IS NOT NULL
  UNION SELECT 'contextual-voice-messages/'||m.media_storage_path FROM public.contextual_messages m
  WHERE m.sender_id='%s'::uuid AND nullif(btrim(m.media_storage_path),'') IS NOT NULL
  UNION SELECT 'direct-voice-messages/'||m.audio_storage_path FROM public.direct_messages m
  WHERE m.sender_id='%s'::uuid AND nullif(btrim(m.audio_storage_path),'') IS NOT NULL
  UNION SELECT 'direct-chat-media/'||a.storage_path FROM public.direct_message_attachments a
  WHERE a.uploader_id='%s'::uuid AND nullif(btrim(a.storage_path),'') IS NOT NULL
  UNION SELECT 'dolab-media/'||m.storage_path FROM public.dolab_media m
  WHERE m.user_id='%s'::uuid AND nullif(btrim(m.storage_path),'') IS NOT NULL
  UNION SELECT CASE split_part(split_part(p.url,'#teswa-object=',2),':',1)
    WHEN 'profile_image' THEN 'profile-images/'||split_part(split_part(p.url,'#teswa-object=',2),':',2)
    WHEN 'item_image' THEN 'item-images/'||split_part(split_part(p.url,'#teswa-object=',2),':',2)
    END
  FROM (
    SELECT avatar_url AS url FROM public.profiles WHERE id='%s'::uuid
    UNION ALL SELECT cover_url FROM public.profiles WHERE id='%s'::uuid
    UNION ALL SELECT im.image_url FROM public.item_images im JOIN public.items i ON i.id=im.item_id
      WHERE i.owner_id='%s'::uuid
  ) p WHERE p.url LIKE '%%#teswa-object=%%:%%'
) owned WHERE nullif(btrim(name),'') IS NOT NULL"""


class AccountApi:
    def __init__(self, auth=None, db=None, storage=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgWriteRunner()
        self.storage = storage

    def store(self):
        if self.storage is None:
            self.storage = OciStorage()
        return self.storage

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if (method != 'POST' or parsed.path != '/v1/account/deletion-request'
                or parsed.query or parsed.fragment or parsed.netloc or parsed.scheme):
            raise ApiError(404, 'not_found')
        if not isinstance(body, dict) or body:
            raise ApiError(400, 'invalid_deletion_request')
        user_id = self.auth.resolve(authorization)
        media = self.db.query(user_id, MEDIA_OBJECTS_SQL % ((user_id,) * 11))
        objects = media.get('objects') if isinstance(media, dict) else None
        if not isinstance(objects, list) or any(not isinstance(value, str) for value in objects):
            raise ApiError(503, 'account_media_inventory_failed')
        # Storage deletion is idempotent (404 is success). Keep the relational
        # identity intact if OCI becomes unavailable part-way through cleanup.
        for name in dict.fromkeys(objects):
            self.store().delete(name)
        result = self.db.query(
            user_id,
            "SELECT json_build_object('deleted',teswa_account.delete_current_user())",
        )
        if not result or result.get('deleted') is not True:
            raise ApiError(409, 'account_deletion_rejected')
        return 200, {
            'ok': True,
            'message': 'تم حذف الحساب وبياناته المرتبطة بنجاح.',
            'errorCode': None,
        }
