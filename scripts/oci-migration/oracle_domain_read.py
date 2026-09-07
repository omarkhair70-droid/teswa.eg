"""Authenticated, read-only Teswa marketplace operations for the OCI rehearsal.

The private Auth service is the identity authority. The database connection must
be a restricted application connection, never a production source connection.
No deployment or production provider switch is performed by this module.
"""
from __future__ import annotations
import base64
import http.client
import json
import os
import re
import subprocess
import uuid
from urllib.parse import parse_qs, urlsplit

MAX_ROWS = 50

class ApiError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status, self.code = status, code

def valid_uuid(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(400, 'invalid_id')

def integer(value, default, maximum):
    if value is None:
        return default
    if not re.fullmatch(r'[0-9]+', value):
        raise ApiError(400, 'invalid_pagination')
    number = int(value)
    if number > maximum:
        raise ApiError(400, 'invalid_pagination')
    return number

def sql_text(value):
    """Encode a value as a SQL expression, never an SQL identifier."""
    if not isinstance(value, str) or len(value) > 1024:
        raise ApiError(400, 'invalid_input')
    encoded = base64.b64encode(value.encode('utf-8')).decode('ascii')
    return "convert_from(decode('%s','base64'),'UTF8')" % encoded

class AuthResolver:
    def __init__(self, port=3110):
        self.port = port
    def resolve(self, authorization):
        if not isinstance(authorization, str) or not authorization.startswith('Bearer '):
            raise ApiError(401, 'invalid_session')
        token = authorization[7:]
        if not token or len(token) > 8192 or any(c.isspace() for c in token):
            raise ApiError(401, 'invalid_session')
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            conn.request('GET', '/v1/auth/session', headers={'Authorization': authorization})
            response = conn.getresponse()
            raw = response.read(16385)
            if response.status != 200 or len(raw) > 16384:
                raise ApiError(401, 'invalid_session')
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get('authenticated') is not True:
                raise ApiError(401, 'invalid_session')
            try:
                return valid_uuid(data.get('user_id'))
            except ApiError:
                raise ApiError(502, 'auth_upstream_unavailable')
        except (OSError, ValueError, KeyError, TypeError):
            raise ApiError(502, 'auth_upstream_unavailable')
        finally:
            conn.close()

class PgReadRunner:
    def __init__(self, database_url=None, psql='/usr/pgsql-17/bin/psql'):
        self.database_url = database_url or os.environ.get('TESWA_DOMAIN_DATABASE_URL')
        self.psql = psql
    def query(self, user_id, statement):
        if not self.database_url:
            raise ApiError(503, 'domain_database_not_configured')
        user_id = valid_uuid(user_id)
        sql = ("BEGIN READ ONLY; SET LOCAL ROLE teswa_app_authenticated; "
               "SELECT set_config('teswa.user_id', '%s', true);\n" % user_id
               + "SELECT (" + statement + ")::text;\nCOMMIT;")
        env = {**os.environ, 'PGOPTIONS': '-c statement_timeout=5000 -c lock_timeout=1000 -c row_security=on'}
        try:
            proc = subprocess.run([self.psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                                   '-d', self.database_url], input=sql, text=True,
                                  capture_output=True, timeout=8, env=env, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise ApiError(503, 'domain_query_failed')
        if proc.returncode != 0:
            raise ApiError(503, 'domain_query_failed')
        lines = proc.stdout.strip().splitlines()
        if len(lines) != 2:
            raise ApiError(503, 'domain_query_failed')
        try:
            return json.loads(lines[1])
        except ValueError:
            raise ApiError(503, 'domain_query_failed')

FEED_COLUMNS = ('id,title,description,cover_image_url,category,item_condition,'
                'city,owner_display_name,created_at')

def feed_sql(limit, offset, filters):
    clauses = []
    for key, column in [('category','category'), ('condition','item_condition'), ('city','city')]:
        if filters.get(key):
            clauses.append(column + ' = ' + sql_text(filters[key]))
    if filters.get('query'):
        pattern = '%' + filters['query'].replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
        text = sql_text(pattern)
        clauses.append('(title ILIKE '+text+" ESCAPE '\\' OR description ILIKE "+text+" ESCAPE '\\')")
    where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
    return ("SELECT json_build_object('items',coalesce(json_agg(row_to_json(t)),'[]'::json),'hasMore',count(*) > %d) "
            "FROM (SELECT %s FROM public.marketplace_items%s ORDER BY created_at DESC,id DESC LIMIT %d OFFSET %d) t" %
            (limit, FEED_COLUMNS, where, limit+1, offset))

def map_feed(row):
    return dict(id=row['id'], title=row.get('title'), description=row.get('description'),
                coverImageUrl=row.get('cover_image_url'), category=row.get('category'),
                condition=row.get('item_condition'), city=row.get('city'),
                ownerDisplayName=row.get('owner_display_name'), createdAt=row['created_at'])

def detail_sql(item_id):
    return """SELECT CASE WHEN i.id IS NULL THEN NULL ELSE json_build_object(
      'id',i.id,'title',i.title,'description',i.description,'condition',i.condition,
      'conditionNotes',i.condition_notes,'city',i.city,'area',i.area,'ownerId',i.owner_id,
      'itemStory',i.item_story,'swapReason',i.swap_reason,'goodFor',i.good_for,
      'desireMode',i.desire_mode,'desireText',i.desire_text,'category',c.name_ar,
      'wantedTags',coalesce((SELECT json_agg(t.tag ORDER BY t.tag)
        FROM public.item_wanted_tags t WHERE t.item_id=i.id),'[]'::json),
      'images',coalesce((SELECT json_agg(json_build_object('imageUrl',m.image_url,
        'isPrimary',m.is_primary,'sortOrder',m.sort_order) ORDER BY m.is_primary DESC,
        m.sort_order NULLS LAST,m.id) FROM public.item_images m WHERE m.item_id=i.id),'[]'::json),
      'ownerPresence',CASE WHEN p.id IS NULL OR coalesce(p.is_banned,false) THEN NULL ELSE
        json_build_object('id',p.id,'displayName',p.display_name,'username',p.username,
        'avatarUrl',p.avatar_url,'profileTagline',p.profile_tagline,'city',p.city,'area',p.area,
        'successfulSwapsCount',p.successful_swaps_count,'responseRate',p.response_rate) END)
      END FROM public.items i LEFT JOIN public.categories c ON c.id=i.category_id
      LEFT JOIN public.profiles p ON p.id=i.owner_id
      WHERE i.id='%s'::uuid AND i.status='active'::public.item_status
      AND (p.id IS NULL OR coalesce(p.is_banned,false)=false)""" % item_id

def owner_listings_sql(profile_id, limit):
    return """SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (
      SELECT i.id,i.title,
        (SELECT m.image_url FROM public.item_images m WHERE m.item_id=i.id
          ORDER BY m.is_primary DESC,m.sort_order NULLS LAST,m.id LIMIT 1) AS \"imageUrl\",
        c.name_ar AS category,i.city,i.area,i.created_at AS \"createdAt\"
      FROM public.items i LEFT JOIN public.categories c ON c.id=i.category_id
      WHERE i.owner_id='%s'::uuid AND i.status='active'::public.item_status
      ORDER BY i.created_at DESC,i.id DESC LIMIT %d) x""" % (profile_id, limit)

class MarketplaceReadApi:
    def __init__(self, auth=None, db=None):
        self.auth = auth or AuthResolver()
        self.db = db or PgReadRunner()
    def handle(self, method, target, authorization):
        if method != 'GET':
            raise ApiError(405, 'method_not_allowed')
        parsed = urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme:
            raise ApiError(400, 'invalid_path')
        user_id = self.auth.resolve(authorization)
        if parsed.path == '/v1/marketplace/feed':
            args = parse_qs(parsed.query, keep_blank_values=True)
            if any(len(v) != 1 for v in args.values()) or set(args)-{'limit','offset','category','condition','city','query'}:
                raise ApiError(400, 'invalid_query')
            get = lambda key: args.get(key, [None])[0]
            limit = integer(get('limit'), 20, MAX_ROWS)
            offset = integer(get('offset'), 0, 10000)
            if limit < 1:
                raise ApiError(400, 'invalid_pagination')
            filters = {key:get(key) for key in ('category','condition','city','query')}
            result = self.db.query(user_id, feed_sql(limit,offset,filters))
            rows = result['items']
            return 200, {'items': [map_feed(r) for r in rows[:limit]], 'hasMore': len(rows)>limit}
        match = re.fullmatch(r'/v1/marketplace/items/([0-9a-fA-F-]{36})', parsed.path)
        if match and not parsed.query:
            item_id = valid_uuid(match.group(1))
            sql = ("SELECT row_to_json(t) FROM (SELECT id,title,description,cover_image_url,category,item_condition,city,owner_display_name,created_at FROM public.marketplace_items WHERE id='%s'::uuid) t" % item_id)
            row = self.db.query(user_id, sql)
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, map_feed(row)
        match = re.fullmatch(r'/v1/marketplace/items/([0-9a-fA-F-]{36})/detail', parsed.path)
        if match and not parsed.query:
            item_id = valid_uuid(match.group(1))
            row = self.db.query(user_id, detail_sql(item_id))
            if row is None:
                raise ApiError(404, 'not_found')
            return 200, row
        match = re.fullmatch(r'/v1/marketplace/owners/([0-9a-fA-F-]{36})/active', parsed.path)
        if match:
            args = parse_qs(parsed.query, keep_blank_values=True)
            if any(len(v) != 1 for v in args.values()) or set(args)-{'limit'}:
                raise ApiError(400, 'invalid_query')
            limit = integer(args.get('limit', [None])[0], 6, 24)
            if limit < 1:
                raise ApiError(400, 'invalid_pagination')
            profile_id = valid_uuid(match.group(1))
            return 200, {'items': self.db.query(user_id, owner_listings_sql(profile_id, limit))}
        raise ApiError(404, 'not_found')
