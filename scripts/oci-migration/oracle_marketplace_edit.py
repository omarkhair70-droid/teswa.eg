"""Owned listing metadata editor backed by the existing PostgreSQL RLS role."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, PgReadRunner, valid_uuid
from oracle_marketplace_write import PgWriteRunner, json_expr, text

FIELDS = {'itemId','ownerId','title','categoryId','city','area','condition',
          'conditionNotes','description','itemStory','swapReason','goodFor',
          'desireMode','desireText','wantedTags'}
TEXT_FIELDS = {'title':160,'city':120,'area':120,'conditionNotes':1000,
               'description':4000,'itemStory':600,'swapReason':240,'goodFor':240,
               'desireText':1000}


def normalize_edit(body, item_id, user_id):
    if not isinstance(body,dict) or set(body)!=FIELDS:
        raise ApiError(400,'invalid_listing_edit')
    if valid_uuid(body['itemId'])!=item_id or valid_uuid(body['ownerId'])!=user_id:
        raise ApiError(403,'actor_mismatch')
    value={key:text(body[key],key,maximum,key=='title') for key,maximum in TEXT_FIELDS.items()}
    value.update(itemId=item_id,ownerId=user_id)
    value['categoryId']=valid_uuid(body['categoryId']) if body['categoryId'] is not None else None
    if body['condition'] not in ('almost_new','good_used','minor_issues','needs_repair'):
        raise ApiError(400,'invalid_condition')
    if body['desireMode'] not in ('specific','flexible','surprise'):
        raise ApiError(400,'invalid_desire_mode')
    value['condition']=body['condition']; value['desireMode']=body['desireMode']
    tags=body['wantedTags']
    if not isinstance(tags,list) or len(tags)>12:
        raise ApiError(400,'invalid_tags')
    value['wantedTags']=list(dict.fromkeys(text(tag,'tag',50,True) for tag in tags))
    return value


def owned_sql(item_id,user_id,images=False):
    if images:
        payload="""json_build_object('itemId',i.id,'title',i.title,'status',i.status,
          'images',coalesce((SELECT json_agg(json_build_object('id',m.id,
          'imageUrl',btrim(m.image_url),'isPrimary',m.is_primary,'sortOrder',m.sort_order,
          'createdAt',m.created_at) ORDER BY m.is_primary DESC,m.sort_order NULLS LAST,
          m.created_at,m.id) FROM public.item_images m WHERE m.item_id=i.id
          AND nullif(btrim(m.image_url),'') IS NOT NULL),'[]'::json))"""
    else:
        payload="""json_build_object('id',i.id,'status',i.status,'title',i.title,
          'categoryId',i.category_id,'city',i.city,'area',i.area,'condition',i.condition,
          'conditionNotes',i.condition_notes,'description',i.description,'itemStory',i.item_story,
          'swapReason',i.swap_reason,'goodFor',i.good_for,'desireMode',i.desire_mode,
          'desireText',i.desire_text,'wantedTags',coalesce((SELECT json_agg(t.tag ORDER BY t.tag)
          FROM public.item_wanted_tags t WHERE t.item_id=i.id),'[]'::json))"""
    return "SELECT %s FROM public.items i WHERE i.id='%s'::uuid AND i.owner_id='%s'::uuid AND i.status IN ('active'::public.item_status,'archived'::public.item_status)" % (payload,item_id,user_id)


class MarketplaceEditApi:
    def __init__(self,auth=None,reads=None,writes=None):
        self.auth=auth or AuthResolver()
        self.reads=reads or PgReadRunner()
        self.writes=writes or PgWriteRunner()

    def handle(self,method,target,authorization,body=None):
        parsed=urlsplit(target)
        if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            raise ApiError(400,'invalid_path')
        match=re.fullmatch(r'/v1/marketplace/items/([0-9a-fA-F-]{36})/(edit|edit/images)',parsed.path)
        if not match: raise ApiError(404,'not_found')
        item_id=valid_uuid(match.group(1)); action=match.group(2)
        if method=='GET':
            if body is not None: raise ApiError(400,'invalid_body')
        elif method=='POST' and action=='edit':
            if not isinstance(body,dict): raise ApiError(400,'invalid_listing_edit')
        else:
            raise ApiError(405,'method_not_allowed')
        user_id=self.auth.resolve(authorization)
        if method=='GET':
            result=self.reads.query(user_id,owned_sql(item_id,user_id,action=='edit/images'))
            if result is None: raise ApiError(404,'not_found')
            if not isinstance(result,dict) or not isinstance(result.get('images' if action=='edit/images' else 'wantedTags'),list):
                raise ApiError(503,'invalid_listing_response')
            return 200,result
        value=normalize_edit(body,item_id,user_id)
        result=self.writes.query(user_id,"SELECT json_build_object('code',teswa_runtime.update_owned_listing_core(%s))" % json_expr(value))
        if not isinstance(result,dict) or result.get('code') not in ('updated','not_found_or_unauthorized','not_editable'):
            raise ApiError(503,'invalid_listing_response')
        code=result['code']
        return 200,{'ok':code=='updated','code':code}
