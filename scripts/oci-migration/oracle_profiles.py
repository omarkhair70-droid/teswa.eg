"""Authenticated Oracle profile core backed by PostgreSQL RLS."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner


PROFILE_JSON = """json_build_object(
  'id',p.id,'displayName',p.display_name,'username',p.username,'bio',p.bio,
  'avatarUrl',p.avatar_url,'coverUrl',p.cover_url,'city',p.city,'area',p.area,
  'profileTagline',p.profile_tagline,'successfulSwapsCount',p.successful_swaps_count,
  'responseRate',p.response_rate,'createdAt',p.created_at)"""


def clean(value, name, maximum, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise ApiError(400, 'invalid_' + name)
    value = value.strip()
    if (required and not value) or len(value) > maximum:
        raise ApiError(400, 'invalid_' + name)
    return value or None


def username(value):
    value = clean(value, 'username', 30, True).lower()
    if not re.fullmatch(r'[a-z0-9_]{3,30}', value):
        raise ApiError(400, 'invalid_username')
    return value


def actor(body, user_id):
    if not isinstance(body, dict) or valid_uuid(body.get('userId')) != user_id:
        raise ApiError(403, 'actor_mismatch')


def image_url(value, user_id):
    if value is None:
        return None
    value = clean(value, 'image_url', 4096, True)
    parsed = urlsplit(value)
    marker = 'teswa-object=profile_image:'
    key = parsed.fragment[len(marker):] if parsed.fragment.startswith(marker) else ''
    if (parsed.scheme != 'https' or not parsed.netloc or not key or
            user_id not in key.split('/') or any(part in ('', '.', '..') for part in key.split('/'))):
        raise ApiError(403, 'image_not_owned')
    return value


class ProfilesApi:
    def __init__(self, auth=None, reads=None, writes=None):
        self.auth = auth or AuthResolver()
        self.reads = reads or PgReadRunner()
        self.writes = writes or PgWriteRunner()

    def handle(self, method, target, authorization, body=None):
        parsed = urlsplit(target)
        if parsed.query or parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = self.auth.resolve(authorization)

        match = re.fullmatch(r'/v1/profiles/([0-9a-fA-F-]{36})', parsed.path)
        if method == 'GET' and (match or parsed.path == '/v1/profiles/me'):
            profile_id = valid_uuid(match.group(1)) if match else user_id
            row = self.reads.query(user_id, "SELECT %s FROM public.profiles p WHERE p.id='%s'::uuid AND (p.id='%s'::uuid OR coalesce(p.is_banned,false)=false)" % (PROFILE_JSON, profile_id, user_id))
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row

        if method == 'GET' and parsed.path == '/v1/profiles/privacy':
            row = self.reads.query(user_id, "SELECT json_build_object('value',coalesce(p.direct_message_privacy::text,'everyone')) FROM public.profiles p WHERE p.id='%s'::uuid" % user_id)
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row

        if method != 'POST' or not isinstance(body, dict):
            raise ApiError(404, 'not_found')

        if parsed.path == '/v1/profiles/setup':
            if set(body) != {'userId', 'displayName', 'username'}:
                raise ApiError(400, 'invalid_profile')
            actor(body, user_id)
            display = clean(body['displayName'], 'display_name', 80, True)
            handle = username(body['username'])
            statement = """WITH x AS (INSERT INTO public.profiles(id,display_name,username)
              VALUES('%s'::uuid,%s,%s) ON CONFLICT(id) DO UPDATE SET
              display_name=excluded.display_name,username=excluded.username,updated_at=now()
              RETURNING id) SELECT json_build_object('ok',EXISTS(SELECT 1 FROM x))""" % (
                user_id, sql_text(display), sql_text(handle))
            result = self.writes.query(user_id, statement)
            if result.get('ok') is not True:
                raise ApiError(503, 'profile_write_failed')
            return 200, {'ok': True}

        if parsed.path == '/v1/profiles/privacy':
            if set(body) != {'userId', 'value'}:
                raise ApiError(400, 'invalid_privacy')
            actor(body, user_id)
            value = body['value']
            if value not in ('everyone', 'followers_only', 'no_one'):
                raise ApiError(400, 'invalid_privacy')
            return self._update(user_id, "direct_message_privacy=%s" % sql_text(value))

        if parsed.path == '/v1/profiles/image':
            if set(body) != {'userId', 'kind', 'imageUrl'} or body['kind'] not in ('avatar', 'cover'):
                raise ApiError(400, 'invalid_profile_image')
            actor(body, user_id)
            value = image_url(body['imageUrl'], user_id)
            column = 'avatar_url' if body['kind'] == 'avatar' else 'cover_url'
            return self._update(user_id, "%s=%s" % (column, sql_text(value) if value else 'NULL'))

        if parsed.path == '/v1/profiles/update':
            expected = {'userId','displayName','username','profileTagline','bio','city','area'}
            if set(body) != expected:
                raise ApiError(400, 'invalid_profile')
            actor(body, user_id)
            values = {
                'display_name': clean(body['displayName'], 'display_name', 80, True),
                'username': username(body['username']),
                'profile_tagline': clean(body['profileTagline'], 'profile_tagline', 160),
                'bio': clean(body['bio'], 'bio', 1000),
                'city': clean(body['city'], 'city', 120),
                'area': clean(body['area'], 'area', 120),
            }
            assignments = ','.join("%s=%s" % (key, sql_text(value) if value is not None else 'NULL') for key, value in values.items())
            statement = """WITH x AS (UPDATE public.profiles p SET %s,updated_at=now()
              WHERE p.id='%s'::uuid RETURNING *) SELECT %s FROM x p""" % (assignments, user_id, PROFILE_JSON)
            row = self.writes.query(user_id, statement)
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row

        raise ApiError(404, 'not_found')

    def _update(self, user_id, assignment):
        statement = """WITH x AS (UPDATE public.profiles SET %s,updated_at=now()
          WHERE id='%s'::uuid RETURNING id) SELECT json_build_object('updated',EXISTS(SELECT 1 FROM x))""" % (assignment, user_id)
        result = self.writes.query(user_id, statement)
        if result.get('updated') is not True:
            raise ApiError(404, 'not_found')
        return 200, {'ok': True}
