"""Authenticated Oracle profile core backed by PostgreSQL RLS."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, integer, sql_text, valid_uuid
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
        query_route = parsed.path.endswith('/connections') or parsed.path == '/v1/people'
        if parsed.fragment or parsed.netloc or parsed.scheme or (parsed.query and not query_route):
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

        if method == 'GET' and parsed.path == '/v1/people':
            args = parse_qs(parsed.query, keep_blank_values=True)
            if any(len(v) != 1 for v in args.values()) or set(args) - {'query','page','pageSize'}:
                raise ApiError(400, 'invalid_query')
            page = integer(args.get('page', [None])[0], 1, 1000)
            page_size = integer(args.get('pageSize', [None])[0], 20, 50)
            if page < 1 or page_size < 1:
                raise ApiError(400, 'invalid_pagination')
            query = args.get('query', [''])[0].strip()
            where = "p.username IS NOT NULL AND coalesce(p.is_banned,false)=false"
            if query:
                if len(query) > 80:
                    raise ApiError(400, 'invalid_query')
                pattern = '%' + query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
                encoded = sql_text(pattern)
                where += " AND (p.display_name ILIKE %s ESCAPE '\\' OR p.username ILIKE %s ESCAPE '\\' OR p.city ILIKE %s ESCAPE '\\' OR p.area ILIKE %s ESCAPE '\\')" % (encoded,encoded,encoded,encoded)
            offset = (page - 1) * page_size
            statement = """SELECT json_build_object('entries',coalesce(json_agg(row_to_json(x)) FILTER (WHERE x.id IS NOT NULL),'[]'::json),
              'hasMore',count(*) > %d) FROM (SELECT p.id,p.display_name AS "displayName",p.username,
              p.avatar_url AS "avatarUrl",p.cover_url AS "coverUrl",p.profile_tagline AS "profileTagline",
              p.bio,p.city,p.area,coalesce(p.successful_swaps_count,0) AS "successfulSwapsCount",
              p.response_rate AS "responseRate",(SELECT count(*) FROM public.items i WHERE i.owner_id=p.id
                AND i.status='active'::public.item_status) AS "activeItemsCount",p.created_at AS "createdAt"
              FROM public.profiles p WHERE %s ORDER BY p.successful_swaps_count DESC NULLS LAST,
              p.created_at DESC,p.id LIMIT %d OFFSET %d) x""" % (page_size,where,page_size+1,offset)
            result = self.reads.query(user_id, statement)
            entries = result.get('entries', [])
            return 200, {'entries': entries[:page_size], 'hasMore': len(entries) > page_size}

        match = re.fullmatch(r'/v1/profiles/([0-9a-fA-F-]{36})/follow-state', parsed.path)
        if method == 'GET' and match:
            target = valid_uuid(match.group(1))
            statement = """SELECT json_build_object('followingByMe',x.following_by_me,
              'followsMe',x.follows_me,'mutual',x.mutual,'followerCount',x.follower_count,
              'followingCount',x.following_count) FROM public.get_user_follow_state('%s'::uuid) x""" % target
            return 200, self.reads.query(user_id, statement)

        match = re.fullmatch(r'/v1/profiles/([0-9a-fA-F-]{36})/connections', parsed.path)
        if method == 'GET' and match:
            args = parse_qs(parsed.query, keep_blank_values=True)
            if any(len(v) != 1 for v in args.values()) or set(args) - {'mode','limit'}:
                raise ApiError(400, 'invalid_query')
            mode = args.get('mode', [''])[0]
            if mode not in ('followers', 'following'):
                raise ApiError(400, 'invalid_mode')
            limit = integer(args.get('limit', [None])[0], 50, 50)
            target = valid_uuid(match.group(1))
            function = 'get_profile_followers' if mode == 'followers' else 'get_profile_following'
            statement = """SELECT coalesce(json_agg(json_build_object('profileId',x.profile_id,
              'displayName',x.display_name,'username',x.username,'avatarUrl',x.avatar_url,
              'city',x.city,'area',x.area)),'[]'::json) FROM public.%s('%s'::uuid,%d) x""" % (function,target,limit)
            return 200, {'items': self.reads.query(user_id, statement)}

        match = re.fullmatch(r'/v1/profiles/([0-9a-fA-F-]{36})/block-state', parsed.path)
        if method == 'GET' and match:
            target = valid_uuid(match.group(1))
            statement = """SELECT json_build_object('blockedByMe',x.blocked_by_me,
              'blockedMe',x.blocked_me,'isBlockedEitherDirection',x.is_blocked_either_direction)
              FROM public.get_user_block_state('%s'::uuid) x""" % target
            return 200, self.reads.query(user_id, statement)

        if method == 'GET' and parsed.path == '/v1/profiles/blocked':
            statement = """SELECT coalesce(json_agg(json_build_object('id',b.blocked_user_id,
              'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url,
              'blockedAt',b.created_at) ORDER BY b.created_at DESC),'[]'::json)
              FROM public.user_blocks b LEFT JOIN public.profiles p ON p.id=b.blocked_user_id
              WHERE b.blocker_id='%s'::uuid""" % user_id
            return 200, {'items': self.reads.query(user_id, statement)}

        match = re.fullmatch(r'/v1/profiles/(me|[0-9a-fA-F-]{36})/trust', parsed.path)
        if method == 'GET' and match:
            target = user_id if match.group(1) == 'me' else valid_uuid(match.group(1))
            statement = """SELECT json_build_object('userId',x.user_id,
              'successfulSwapsCount',x.successful_swaps_count,'completedDealsCount',x.completed_deals_count,
              'cancelledDealsCount',x.cancelled_deals_count,'totalReviewsReceived',x.total_reviews_received,
              'averageRating',x.average_rating,'clearDescriptionCount',x.clear_description_count,
              'goodCommunicationCount',x.good_communication_count,'onTimeCount',x.on_time_count,
              'respectfulSwapperCount',x.respectful_swapper_count,'responseRate',x.response_rate,
              'avgResponseTimeMinutes',x.avg_response_time_minutes,'trustLevelKey',x.trust_level_key,
              'trustScore',x.trust_score) FROM public.get_user_trust_metrics('%s'::uuid) x""" % target
            return 200, {'metrics': self.reads.query(user_id, statement)}

        match = re.fullmatch(r'/v1/profiles/(me|[0-9a-fA-F-]{36})/badges', parsed.path)
        if method == 'GET' and match:
            target = user_id if match.group(1) == 'me' else valid_uuid(match.group(1))
            statement = """SELECT coalesce(json_agg(json_build_object('badgeKey',x.badge_key,
              'labelAr',x.label_ar,'descriptionAr',x.description_ar,'category',x.category,
              'iconName',x.icon_name,'priority',x.priority,'awardedAt',x.awarded_at)
              ORDER BY x.priority,x.awarded_at),'[]'::json) FROM public.get_user_badges('%s'::uuid) x""" % target
            return 200, {'items': self.reads.query(user_id, statement)}

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

        match = re.fullmatch(r'/v1/profiles/([0-9a-fA-F-]{36})/(follow|unfollow|block|unblock)', parsed.path)
        if match:
            if set(body) != {'userId'}:
                raise ApiError(400, 'invalid_social_action')
            actor(body, user_id)
            target = valid_uuid(match.group(1))
            if target == user_id:
                raise ApiError(400, 'invalid_target')
            action = match.group(2)
            if action in ('follow', 'unfollow'):
                function = 'follow_user' if action == 'follow' else 'unfollow_user'
                statement = "SELECT row_to_json(x) FROM public.%s('%s'::uuid) x" % (function,target)
                result = self.writes.query(user_id, statement)
                if not isinstance(result, dict) or result.get('ok') is not True:
                    raise ApiError(409, (result or {}).get('code','social_action_rejected'))
                return 200, result
            if action == 'block':
                statement = """WITH x AS (INSERT INTO public.user_blocks(blocker_id,blocked_user_id)
                  VALUES('%s'::uuid,'%s'::uuid) ON CONFLICT DO NOTHING RETURNING 1)
                  SELECT json_build_object('ok',true,'code',CASE WHEN EXISTS(SELECT 1 FROM x)
                    THEN NULL ELSE 'already_blocked' END,'message','Blocked.')""" % (user_id,target)
            else:
                statement = """WITH x AS (DELETE FROM public.user_blocks WHERE blocker_id='%s'::uuid
                  AND blocked_user_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',true,
                  'code',CASE WHEN EXISTS(SELECT 1 FROM x) THEN NULL ELSE 'not_blocked' END,
                  'message','Unblocked.')""" % (user_id,target)
            return 200, self.writes.query(user_id, statement)

        if parsed.path == '/v1/profiles/badges/refresh':
            if body:
                raise ApiError(400, 'invalid_refresh')
            result = self.writes.query(user_id, "SELECT public.refresh_my_badges()")
            return 200, {'awardedBadges': result.get('awarded_badges',[]) if isinstance(result,dict) else []}

        raise ApiError(404, 'not_found')

    def _update(self, user_id, assignment):
        statement = """WITH x AS (UPDATE public.profiles SET %s,updated_at=now()
          WHERE id='%s'::uuid RETURNING id) SELECT json_build_object('updated',EXISTS(SELECT 1 FROM x))""" % (assignment, user_id)
        result = self.writes.query(user_id, statement)
        if result.get('updated') is not True:
            raise ApiError(404, 'not_found')
        return 200, {'ok': True}
