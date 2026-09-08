"""Authenticated Oracle stories API using the migrated tables and RLS."""
from __future__ import annotations

import re
import uuid
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner

STORY_JSON="""json_build_object('id',s.id,'userId',s.user_id,'mediaType',s.media_type,
  'mediaStoragePath',s.media_storage_path,'mediaThumbnailStoragePath',s.media_thumbnail_storage_path,
  'caption',s.caption,'durationMs',s.duration_ms,'width',s.width,'height',s.height,
  'createdAt',s.created_at,'expiresAt',s.expires_at)"""

def obj(value,keys,code):
    if not isinstance(value,dict) or set(value)!=set(keys):raise ApiError(400,code)
    return value
def actor(value,user_id):
    if valid_uuid(value)!=user_id:raise ApiError(403,'actor_mismatch')
def ids(value):
    if not isinstance(value,str):raise ApiError(400,'invalid_ids')
    result=[]
    for entry in value.split(','):
        item=valid_uuid(entry)
        if item not in result:result.append(item)
    if not 1<=len(result)<=100:raise ApiError(400,'invalid_ids')
    return result
def array(values):return 'ARRAY[%s]::uuid[]'%','.join("'%s'::uuid"%value for value in values)
def optional_text(value,maximum):
    if value is None:return None
    if not isinstance(value,str) or len(value.strip())>maximum:raise ApiError(400,'invalid_text')
    return value.strip() or None
def positive(value,maximum):
    if value is None:return None
    if not isinstance(value,int) or isinstance(value,bool) or not 1<=value<=maximum:raise ApiError(400,'invalid_media_metadata')
    return value

class StoriesApi:
    def __init__(self,auth=None,db=None):self.auth=auth or AuthResolver();self.db=db or PgWriteRunner()
    def handle(self,method,target,authorization,body=None):
        parsed=urlsplit(target)
        if parsed.fragment or parsed.netloc or parsed.scheme:raise ApiError(400,'invalid_path')
        user_id=self.auth.resolve(authorization)
        if method=='POST' and parsed.path=='/v1/stories':
            value=obj(body,('userId','mediaType','mediaStoragePath','mediaThumbnailStoragePath','caption','durationMs','width','height'),'invalid_story')
            actor(value['userId'],user_id)
            if value['mediaType'] not in ('image','video'):raise ApiError(400,'invalid_story')
            path=value['mediaStoragePath']; thumb=value['mediaThumbnailStoragePath']
            for entry in (path,thumb):
                if entry is not None and (not isinstance(entry,str) or not entry.startswith(user_id+'/') or len(entry)>1024 or any(x in ('','.','..') for x in entry.split('/'))):raise ApiError(403,'story_media_not_owned')
            caption=optional_text(value['caption'],220);duration=positive(value['durationMs'],120000)
            width=positive(value['width'],20000);height=positive(value['height'],20000)
            if value['mediaType']=='image' and duration is not None:raise ApiError(400,'invalid_story')
            statement="""WITH x AS (INSERT INTO public.stories(user_id,media_type,media_storage_path,
              media_thumbnail_storage_path,caption,duration_ms,width,height) VALUES('%s'::uuid,%s,%s,%s,%s,%s,%s,%s)
              RETURNING id) SELECT json_build_object('storyId',id) FROM x"""%(user_id,sql_text(value['mediaType']),sql_text(path),
                sql_text(thumb) if thumb else 'NULL',sql_text(caption) if caption else 'NULL',duration if duration else 'NULL',
                width if width else 'NULL',height if height else 'NULL')
            result=self.db.query(user_id,statement)
            if not isinstance(result,dict) or not result.get('storyId'):raise ApiError(409,'story_create_rejected')
            return 201,result
        match=re.fullmatch(r'/v1/stories/([0-9a-fA-F-]{36})/delete',parsed.path)
        if method=='POST' and match:
            value=obj(body,('userId',),'invalid_delete');actor(value['userId'],user_id);story_id=valid_uuid(match.group(1))
            statement="""WITH owned AS (SELECT id,media_storage_path,media_thumbnail_storage_path FROM public.stories
              WHERE id='%s'::uuid AND user_id='%s'::uuid), deleted AS (DELETE FROM public.stories WHERE id IN(SELECT id FROM owned) RETURNING id)
              SELECT CASE WHEN EXISTS(SELECT 1 FROM deleted) THEN json_build_object('found',true,'storagePaths',
                (SELECT to_json(array_remove(ARRAY[media_storage_path,media_thumbnail_storage_path],NULL)) FROM owned))
                ELSE json_build_object('found',false,'storagePaths','[]'::json) END"""%(story_id,user_id)
            result=self.db.query(user_id,statement)
            return (200,result) if result.get('found') else (404,{'error':'not_found'})
        match=re.fullmatch(r'/v1/stories/users/([0-9a-fA-F-]{36})/active',parsed.path)
        if method=='GET' and match:
            if parsed.query:raise ApiError(400,'invalid_query')
            target_user=valid_uuid(match.group(1));result=self.db.query(user_id,"SELECT coalesce(json_agg(%s ORDER BY s.created_at,s.id),'[]'::json) FROM public.stories s WHERE s.user_id='%s'::uuid AND s.expires_at>now()"%(STORY_JSON,target_user))
            return 200,{'items':result if isinstance(result,list) else []}
        if method=='GET' and parsed.path=='/v1/stories/home':
            if parsed.query:raise ApiError(400,'invalid_query')
            statement="""SELECT coalesce(json_agg(json_build_object('author',json_build_object('id',p.id,
              'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url),'stories',x.stories,
              'latestCreatedAt',x.latest) ORDER BY x.latest DESC,p.id),'[]'::json) FROM public.profiles p JOIN LATERAL(
              SELECT json_agg(%s ORDER BY s.created_at,s.id) stories,max(s.created_at) latest FROM public.stories s
              WHERE s.user_id=p.id AND s.expires_at>now())x ON x.latest IS NOT NULL"""%STORY_JSON
            result=self.db.query(user_id,statement);return 200,{'items':result if isinstance(result,list) else []}
        match=re.fullmatch(r'/v1/stories/authors/([0-9a-fA-F-]{36})',parsed.path)
        if method=='GET' and match:
            if parsed.query:raise ApiError(400,'invalid_query')
            result=self.db.query(user_id,"SELECT json_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url) FROM public.profiles p WHERE p.id='%s'::uuid"%valid_uuid(match.group(1)))
            return 200,{'item':result}
        if method=='GET' and parsed.path in ('/v1/stories/likes','/v1/stories/likes/counts','/v1/stories/views/counts'):
            query=parse_qs(parsed.query,keep_blank_values=True)
            required={'ids'} if parsed.path.endswith('/counts') else {'viewerId','ids'}
            if set(query)!=required or any(len(v)!=1 for v in query.values()):raise ApiError(400,'invalid_query')
            values=ids(query['ids'][0])
            if 'viewerId' in query:actor(query['viewerId'][0],user_id)
            table,key=('story_views','viewer_id') if '/views/' in parsed.path else ('story_likes','liker_id')
            if not parsed.path.endswith('/counts'):
                result=self.db.query(user_id,"SELECT coalesce(json_object_agg(story_id,true),'{}'::json) FROM public.story_likes WHERE liker_id='%s'::uuid AND story_id=ANY(%s)"%(user_id,array(values)))
            else:
                result=self.db.query(user_id,"SELECT coalesce(json_object_agg(story_id,total),'{}'::json) FROM (SELECT story_id,count(*)::integer total FROM public.%s WHERE story_id=ANY(%s) GROUP BY story_id)x"%(table,array(values)))
            return 200,{'values':result if isinstance(result,dict) else {}}
        match=re.fullmatch(r'/v1/stories/([0-9a-fA-F-]{36})/(like|view)',parsed.path)
        if method=='POST' and match:
            story_id=valid_uuid(match.group(1))
            if match.group(2)=='like':
                value=obj(body,('likerId','liked'),'invalid_like');actor(value['likerId'],user_id)
                if not isinstance(value['liked'],bool):raise ApiError(400,'invalid_like')
                if value['liked']:
                    sql="WITH x AS (INSERT INTO public.story_likes(story_id,liker_id) VALUES('%s'::uuid,'%s'::uuid) ON CONFLICT DO NOTHING RETURNING 1) SELECT json_build_object('liked',true)"%(story_id,user_id)
                else:
                    sql="WITH x AS (DELETE FROM public.story_likes WHERE story_id='%s'::uuid AND liker_id='%s'::uuid RETURNING 1) SELECT json_build_object('liked',false)"%(story_id,user_id)
                return 200,self.db.query(user_id,sql)
            value=obj(body,('viewerId',),'invalid_view');actor(value['viewerId'],user_id)
            result=self.db.query(user_id,"WITH x AS (INSERT INTO public.story_views(story_id,viewer_id) VALUES('%s'::uuid,'%s'::uuid) ON CONFLICT DO NOTHING RETURNING 1) SELECT json_build_object('ok',true)"%(story_id,user_id))
            return 200,{'ok':bool(result and result.get('ok'))}
        match=re.fullmatch(r'/v1/stories/([0-9a-fA-F-]{36})/viewers',parsed.path)
        if method=='GET' and match:
            query=parse_qs(parsed.query,keep_blank_values=True)
            if set(query)!={'ownerId'} or len(query['ownerId'])!=1:raise ApiError(400,'invalid_query')
            actor(query['ownerId'][0],user_id);story_id=valid_uuid(match.group(1))
            statement="""SELECT json_build_object('storyId',s.id,'storyCreatedAt',s.created_at,'storyCaption',s.caption,
              'viewers',coalesce((SELECT json_agg(json_build_object('viewerId',v.viewer_id,'displayName',p.display_name,
                'username',p.username,'avatarUrl',p.avatar_url,'viewedAt',v.viewed_at) ORDER BY v.viewed_at DESC,v.id)
                FROM public.story_views v LEFT JOIN public.profiles p ON p.id=v.viewer_id WHERE v.story_id=s.id),'[]'::json))
              FROM public.stories s WHERE s.id='%s'::uuid AND s.user_id='%s'::uuid"""%(story_id,user_id)
            result=self.db.query(user_id,statement);return 200,{'item':result}
        if method=='GET' and parsed.path=='/v1/stories/video-drops':
            query=parse_qs(parsed.query,keep_blank_values=True)
            if set(query)-{'limit'} or any(len(v)!=1 for v in query.values()):raise ApiError(400,'invalid_query')
            try:limit=int(query.get('limit',['20'])[0])
            except ValueError:raise ApiError(400,'invalid_limit')
            if not 1<=limit<=100:raise ApiError(400,'invalid_limit')
            statement="""SELECT coalesce(json_agg(row_to_json(x) ORDER BY x."createdAt" DESC,x."storyId"),'[]'::json) FROM(
              SELECT s.id "storyId",s.user_id "authorId",p.display_name "authorDisplayName",p.username "authorUsername",
              p.avatar_url "authorAvatarUrl",s.media_storage_path "mediaStoragePath",s.caption,s.duration_ms "durationMs",s.created_at "createdAt"
              FROM public.stories s LEFT JOIN public.profiles p ON p.id=s.user_id WHERE s.media_type='video' AND s.expires_at>now()
              ORDER BY s.created_at DESC,s.id LIMIT %d)x"""%limit
            result=self.db.query(user_id,statement);return 200,{'items':result if isinstance(result,list) else []}
        raise ApiError(404,'not_found')
