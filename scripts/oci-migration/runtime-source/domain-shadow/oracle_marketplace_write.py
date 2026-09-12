"""Authenticated marketplace publishing against PostgreSQL RLS."""
from __future__ import annotations

import base64
import json
import logging
import math
import os
import re
import subprocess
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid


def text(value, name, maximum, required=False):
    if value is None and not required: return None
    if not isinstance(value, str): raise ApiError(400, 'invalid_'+name)
    value=value.strip()
    if (required and not value) or len(value)>maximum: raise ApiError(400, 'invalid_'+name)
    return value or None


def publish_input(body, user_id):
    expected={'itemId','ownerId','title','categoryId','description','condition','conditionNotes','city','area',
              'locationLatitude','locationLongitude','desireMode','desireText','itemStory','swapReason','goodFor','images'}
    if not isinstance(body,dict) or set(body)!=expected: raise ApiError(400,'invalid_publish_input')
    item_id=valid_uuid(body['itemId'])
    if valid_uuid(body['ownerId']) != user_id: raise ApiError(403,'owner_mismatch')
    category=valid_uuid(body['categoryId']) if body['categoryId'] is not None else None
    condition=body['condition']
    if condition not in ('almost_new','good_used','minor_issues','needs_repair'): raise ApiError(400,'invalid_condition')
    mode=body['desireMode']
    if mode not in ('specific','flexible','surprise'): raise ApiError(400,'invalid_desire_mode')
    lat,lon=body['locationLatitude'],body['locationLongitude']
    for value,minimum,maximum in ((lat,-90,90),(lon,-180,180)):
        if value is not None and (not isinstance(value,(int,float)) or isinstance(value,bool)
                                  or not math.isfinite(value) or not minimum<=value<=maximum):
            raise ApiError(400,'invalid_location')
    images=body['images']
    if not isinstance(images,list) or not 1<=len(images)<=8: raise ApiError(400,'invalid_images')
    normalized=[]
    for index,image in enumerate(images):
        if not isinstance(image,dict) or set(image)!= {'imageUrl','isPrimary','sortOrder'}:
            raise ApiError(400,'invalid_images')
        url=image['imageUrl']
        parsed=urlsplit(url) if isinstance(url,str) and len(url)<=4096 else None
        if not parsed or parsed.scheme!='https' or not parsed.netloc: raise ApiError(400,'invalid_images')
        marker='teswa-object=item_image:'
        object_key=parsed.fragment[len(marker):] if parsed.fragment.startswith(marker) else ''
        if (not object_key or user_id not in object_key.split('/') or object_key.startswith('/')
                or '\\' in object_key or any(part in ('','.','..') for part in object_key.split('/'))):
            raise ApiError(403,'image_not_owned')
        if not isinstance(image['isPrimary'],bool) or image['sortOrder'] != index:
            raise ApiError(400,'invalid_images')
        normalized.append({'imageUrl':url,'isPrimary':image['isPrimary'],'sortOrder':index})
    if sum(1 for image in normalized if image['isPrimary']) != 1 or not normalized[0]['isPrimary']:
        raise ApiError(400,'invalid_images')
    return {'itemId':item_id,'ownerId':user_id,'title':text(body['title'],'title',160,True),
            'categoryId':category,'description':text(body['description'],'description',4000),
            'condition':condition,'conditionNotes':text(body['conditionNotes'],'condition_notes',1000),
            'city':text(body['city'],'city',120),'area':text(body['area'],'area',120),
            'locationLatitude':lat,'locationLongitude':lon,'desireMode':mode,
            'desireText':text(body['desireText'],'desire_text',1000),
            'itemStory':text(body['itemStory'],'item_story',600),
            'swapReason':text(body['swapReason'],'swap_reason',240),'goodFor':text(body['goodFor'],'good_for',240),'images':normalized}


def json_expr(value):
    encoded=base64.b64encode(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).decode()
    return "convert_from(decode('%s','base64'),'UTF8')::jsonb" % encoded


def publish_sql(value):
    payload=json_expr(value)
    return """WITH p AS (SELECT %s AS v), rowdata AS (
      SELECT r.* FROM p,LATERAL jsonb_populate_record(NULL::public.items,jsonb_build_object(
        'id',v->'itemId','owner_id',v->'ownerId','title',v->'title','category_id',v->'categoryId',
        'description',v->'description','condition',v->'condition','condition_notes',v->'conditionNotes',
        'city',v->'city','area',v->'area','location_latitude',v->'locationLatitude',
        'location_longitude',v->'locationLongitude','desire_mode',v->'desireMode','desire_text',v->'desireText',
        'item_story',v->'itemStory','swap_reason',v->'swapReason','good_for',v->'goodFor',
        'status','active','source','direct_listing')) r)
      INSERT INTO public.items(id,owner_id,title,category_id,description,condition,condition_notes,city,area,
        location_latitude,location_longitude,desire_mode,desire_text,item_story,swap_reason,good_for,status,source)
      SELECT id,owner_id,title,category_id,description,condition,condition_notes,city,area,location_latitude,
        location_longitude,desire_mode,desire_text,item_story,swap_reason,good_for,status,source FROM rowdata;
      WITH p AS (SELECT %s AS v)
      INSERT INTO public.item_images(item_id,image_url,is_primary,sort_order)
      SELECT (p.v->>'itemId')::uuid,x."imageUrl",x."isPrimary",x."sortOrder" FROM p,LATERAL jsonb_to_recordset(p.v->'images')
        AS x("imageUrl" text,"isPrimary" boolean,"sortOrder" integer);
      WITH p AS (SELECT %s AS v) SELECT json_build_object('itemId',p.v->>'itemId','imagesInserted',
        (SELECT count(*) FROM public.item_images WHERE item_id=(p.v->>'itemId')::uuid)) FROM p""" % (payload,payload,payload)


_SQLSTATE = re.compile(r'(?m)^(?:ERROR|FATAL|PANIC):\s*([0-9A-Z]{5})(?:\s|$)')


def sqlstate_from_stderr(stderr):
    """Return only the SQLSTATE; never log SQL, values, or raw database errors."""
    match = _SQLSTATE.search(stderr or '')
    return match.group(1) if match else 'unknown'


class PgWriteRunner:
    def __init__(self,database_url=None,psql='/usr/pgsql-17/bin/psql'):
        self.database_url=database_url or os.environ.get('TESWA_DOMAIN_DATABASE_URL'); self.psql=psql

    def _execute(self,user_id,statement,rollback=False):
        if not self.database_url: raise ApiError(503,'domain_database_not_configured')
        user_id=valid_uuid(user_id)
        # A data-modifying WITH must be the top-level statement. Do not wrap it
        # in SELECT (...); PostgreSQL rejects that with SQLSTATE 0A000.
        sql=("BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT set_config('teswa.user_id','%s',true);\n" % user_id
             + statement + ";\n" + ("ROLLBACK;" if rollback else "COMMIT;"))
        env={**os.environ,'PGOPTIONS':'-c statement_timeout=8000 -c lock_timeout=1000 -c row_security=on'}
        try:
            proc=subprocess.run([self.psql,'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d',self.database_url],input=sql,text=True,capture_output=True,timeout=12,env=env,check=False)
        except (OSError,subprocess.TimeoutExpired): raise ApiError(503,'domain_write_failed')
        if proc.returncode:
            logging.getLogger(__name__).warning('domain_write_rejected sqlstate=%s',sqlstate_from_stderr(proc.stderr))
            raise ApiError(409,'domain_write_rejected')
        lines=proc.stdout.strip().splitlines()
        if len(lines)!=2: raise ApiError(503,'domain_write_failed')
        try: return json.loads(lines[1])
        except ValueError: raise ApiError(503,'domain_write_failed')

    def query(self,user_id,statement):
        return self._execute(user_id,statement)

    def diagnose(self,user_id,statement):
        """Operator-only rollback probe; never exposed as an HTTP endpoint."""
        if self.database_url != 'dbname=teswa_rehearsal':
            raise ApiError(503,'rehearsal_database_required')
        guard="DO $$ BEGIN IF current_database() <> 'teswa_rehearsal' THEN RAISE EXCEPTION 'rehearsal_database_required'; END IF; END $$;\n"
        return self._execute(user_id,guard+statement,rollback=True)


class MarketplaceWriteApi:
    def __init__(self,auth=None,db=None): self.auth=auth or AuthResolver(); self.db=db or PgWriteRunner()
    def handle(self,method,target,authorization,body):
        if method!='POST' or not isinstance(body,dict): raise ApiError(404,'not_found')
        parsed=urlsplit(target)
        if parsed.query or parsed.fragment or parsed.netloc or parsed.scheme: raise ApiError(400,'invalid_path')
        user_id=self.auth.resolve(authorization)
        if parsed.path=='/v1/marketplace/items':
            value=publish_input(body,user_id); result=self.db.query(user_id,publish_sql(value))
            if result.get('itemId')!=value['itemId'] or result.get('imagesInserted')!=len(value['images']):
                raise ApiError(503,'domain_write_failed')
            return 201, {'itemId':value['itemId']}
        if parsed.path=='/v1/marketplace/likes':
            if set(body)!={'itemId','userId','liked'} or valid_uuid(body['userId'])!=user_id or not isinstance(body['liked'],bool):
                raise ApiError(403,'actor_mismatch')
            item_id=valid_uuid(body['itemId'])
            if body['liked']:
                statement="""INSERT INTO public.item_likes(item_id,user_id) VALUES('%s'::uuid,'%s'::uuid)
                  ON CONFLICT DO NOTHING; SELECT json_build_object('liked',true)""" % (item_id,user_id)
            else:
                statement="""DELETE FROM public.item_likes WHERE item_id='%s'::uuid AND user_id='%s'::uuid;
                  SELECT json_build_object('liked',false)""" % (item_id,user_id)
            return 200,self.db.query(user_id,statement)
        match=re.fullmatch(r'/v1/marketplace/items/([0-9a-fA-F-]{36})/(publish-failed|video|wanted-tags|images/delete)',parsed.path)
        if not match: raise ApiError(404,'not_found')
        item_id=valid_uuid(match.group(1)); action=match.group(2)
        if action=='publish-failed':
            if set(body)!={'ownerId'} or valid_uuid(body['ownerId'])!=user_id: raise ApiError(403,'owner_mismatch')
            statement="""WITH x AS (UPDATE public.items SET status='archived' WHERE id='%s'::uuid
              AND owner_id='%s'::uuid RETURNING 1) SELECT json_build_object('ok',EXISTS(SELECT 1 FROM x))""" % (item_id,user_id)
        elif action=='video':
            if set(body)!={'itemId','videoStoragePath','durationMs','width','height'} or valid_uuid(body['itemId'])!=item_id:
                raise ApiError(400,'invalid_video')
            path=body['videoStoragePath']; prefix='%s/%s/'%(user_id,item_id)
            if not isinstance(path,str) or not path.startswith(prefix) or len(path)>1024 or '/' in path[len(prefix):]: raise ApiError(403,'video_not_owned')
            def number(value):
                if value is None:return 'NULL'
                if not isinstance(value,int) or isinstance(value,bool) or value<1:return 'NULL'
                return str(value)
            statement="""WITH x AS (INSERT INTO public.item_videos(item_id,video_storage_path,duration_ms,width,height)
              VALUES('%s'::uuid,%s,%s,%s,%s) RETURNING 1) SELECT json_build_object('ok',EXISTS(SELECT 1 FROM x))""" % (
                item_id,sql_text(path),number(body['durationMs']),number(body['width']),number(body['height']))
        elif action=='wanted-tags':
            if set(body)!={'tags'} or not isinstance(body['tags'],list) or len(body['tags'])>12: raise ApiError(400,'invalid_tags')
            tags=[]
            for tag in body['tags']:
                value=text(tag,'tag',50,True)
                if value not in tags: tags.append(value)
            if not tags:return 200,{'ok':True}
            values=','.join("('%s'::uuid,%s)"%(item_id,sql_text(tag)) for tag in tags)
            statement="""WITH x AS (INSERT INTO public.item_wanted_tags(item_id,tag) VALUES %s
              ON CONFLICT DO NOTHING RETURNING 1) SELECT json_build_object('ok',true,'inserted',(SELECT count(*) FROM x))"""%values
        else:
            if body: raise ApiError(400,'invalid_delete')
            statement="""WITH x AS (DELETE FROM public.item_images m WHERE m.item_id='%s'::uuid
              AND EXISTS(SELECT 1 FROM public.items i WHERE i.id=m.item_id AND i.owner_id='%s'::uuid) RETURNING 1)
              SELECT json_build_object('ok',true,'deleted',(SELECT count(*) FROM x))"""%(item_id,user_id)
        result=self.db.query(user_id,statement)
        if result.get('ok') is not True: raise ApiError(409,'domain_write_rejected')
        return 200,{'ok':True}
