"""Oracle-backed City Pulse discovery assembled under the authenticated RLS role."""
from __future__ import annotations

from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text
from oracle_marketplace_write import PgWriteRunner, json_expr

def limits(body):
    expected={'matchTerms','movingItemsLimit','storyItemsLimit','peopleLimit','storyAuthorsLimit'}
    if not isinstance(body,dict) or set(body)!=expected or not isinstance(body['matchTerms'],list):raise ApiError(400,'invalid_discovery')
    terms=[]
    for value in body['matchTerms']:
        if not isinstance(value,str) or len(value.strip())>80:raise ApiError(400,'invalid_discovery')
        value=value.strip()
        if value and value not in terms:terms.append(value)
    if len(terms)>10:raise ApiError(400,'invalid_discovery')
    result=[]
    for key in ('movingItemsLimit','storyItemsLimit','peopleLimit','storyAuthorsLimit'):
        value=body[key]
        if not isinstance(value,int) or isinstance(value,bool) or not 1<=value<=100:raise ApiError(400,'invalid_discovery')
        result.append(value)
    return terms,result

def location(terms,alias):
    if not terms:return 'TRUE'
    clauses=[]
    for term in terms:
        pattern=sql_text('%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')
        clauses.append("(%s.city ILIKE %s ESCAPE '\\' OR %s.area ILIKE %s ESCAPE '\\')"%(alias,pattern,alias,pattern))
    return '('+' OR '.join(clauses)+')'

class DiscoveryApi:
    def __init__(self,auth=None,db=None):self.auth=auth or AuthResolver();self.db=db or PgWriteRunner()
    def handle(self,method,target,authorization,body=None):
        parsed=urlsplit(target)
        if method!='POST' or parsed.path!='/v1/discovery/city-pulse' or parsed.query or parsed.fragment or parsed.netloc or parsed.scheme:raise ApiError(404,'not_found')
        user_id=self.auth.resolve(authorization);terms,values=limits(body);moving_limit,story_limit,people_limit,authors_limit=values
        term_array="ARRAY(SELECT jsonb_array_elements_text(%s))::text[]"%json_expr(terms)
        moving=self.db.query(user_id,"""SELECT coalesce(json_agg(row_to_json(z) ORDER BY z."openInterestCount" DESC,z."latestInterestAt" DESC,z.id),'[]'::json) FROM(
          SELECT i.id,coalesce(nullif(trim(i.title),''),'عنصر بدون عنوان') title,img.image_url "imageUrl",c.name_ar category,
          i.condition::text condition,i.city,i.area,p.display_name "ownerDisplayName",x.open_interest_count::integer "openInterestCount",x.latest_interest_at "latestInterestAt"
          FROM public.get_public_city_pulse_moving_items(%s,%d) x JOIN public.items i ON i.id=x.item_id
          LEFT JOIN public.categories c ON c.id=i.category_id LEFT JOIN public.profiles p ON p.id=i.owner_id
          LEFT JOIN LATERAL(SELECT image_url FROM public.item_images m WHERE m.item_id=i.id ORDER BY m.is_primary DESC,m.sort_order NULLS LAST,m.id LIMIT 1)img ON true
          WHERE i.status::text='active')z"""%(term_array,moving_limit))
        story=self.db.query(user_id,"""SELECT coalesce(json_agg(row_to_json(z) ORDER BY z."createdAt" DESC,z.id),'[]'::json) FROM(
          SELECT i.id,coalesce(nullif(trim(i.title),''),'عنصر بدون عنوان') title,img.image_url "imageUrl",c.name_ar category,i.city,i.area,
          i.owner_id "ownerId",p.display_name "ownerDisplayName",CASE WHEN nullif(trim(i.item_story),'') IS NOT NULL THEN 'حكاية العنصر'
          WHEN nullif(trim(i.swap_reason),'') IS NOT NULL THEN 'ليه صاحبه بيبدله' ELSE 'مفيد لمين' END "storyLabel",
          coalesce(nullif(trim(i.item_story),''),nullif(trim(i.swap_reason),''),nullif(trim(i.good_for),'')) "storySnippet",i.created_at "createdAt"
          FROM public.items i LEFT JOIN public.categories c ON c.id=i.category_id LEFT JOIN public.profiles p ON p.id=i.owner_id
          LEFT JOIN LATERAL(SELECT image_url FROM public.item_images m WHERE m.item_id=i.id ORDER BY m.is_primary DESC,m.sort_order NULLS LAST,m.id LIMIT 1)img ON true
          WHERE i.status::text='active' AND coalesce(nullif(trim(i.item_story),''),nullif(trim(i.swap_reason),''),nullif(trim(i.good_for),'')) IS NOT NULL
          AND %s ORDER BY i.created_at DESC,i.id LIMIT %d)z"""%(location(terms,'i'),story_limit))
        people=self.db.query(user_id,"""SELECT coalesce(json_agg(row_to_json(z) ORDER BY z.swaps DESC,z."createdAt" DESC,z.id),'[]'::json) FROM(
          SELECT p.id,coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'مستخدم') "displayName",coalesce(p.username,'') username,
          p.avatar_url "avatarUrl",p.city,p.area,p.profile_tagline "profileTagline",(SELECT count(*)::integer FROM public.items i WHERE i.owner_id=p.id AND i.status::text='active') "activeItemsCount",
          coalesce(p.successful_swaps_count,0) swaps,p.created_at "createdAt" FROM public.profiles p WHERE p.username IS NOT NULL AND coalesce(p.is_banned,false)=false
          AND %s ORDER BY p.successful_swaps_count DESC NULLS LAST,p.created_at DESC,p.id LIMIT %d)z"""%(location(terms,'p'),people_limit))
        authors=self.db.query(user_id,"""SELECT coalesce(json_agg(row_to_json(z) ORDER BY z."latestCreatedAt" DESC,z.id),'[]'::json) FROM(
          SELECT p.id,json_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url) author,
          count(s.id)::integer "storiesCount",max(s.created_at) "latestCreatedAt" FROM public.profiles p JOIN public.stories s ON s.user_id=p.id AND s.expires_at>now()
          WHERE coalesce(p.is_banned,false)=false AND %s GROUP BY p.id,p.display_name,p.username,p.avatar_url
          ORDER BY max(s.created_at) DESC,p.id LIMIT %d)z"""%(location(terms,'p'),authors_limit))
        for value in (moving,story,people,authors):
            if not isinstance(value,list):raise ApiError(503,'discovery_read_failed')
        for value in people:value.pop('swaps',None);value.pop('createdAt',None)
        for value in authors:value.pop('id',None)
        return 200,{'movingItems':moving,'storyItems':story,'people':people,'activeStoryAuthors':authors}
