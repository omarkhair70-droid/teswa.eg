"""Authenticated Oracle reporting and moderation API using existing RPCs/RLS."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from oracle_domain_read import ApiError, AuthResolver, sql_text, valid_uuid
from oracle_marketplace_write import PgWriteRunner

REASONS=('misleading_item','inappropriate_content','spam_offer','unsafe_behavior','no_show','harassment','fraud','other')
STATUSES=('open','reviewing','actioned','dismissed')
TYPES=('all','user','item','story','deal','direct_message','deal_message')
PROFILE="json_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url)"

def exact(value,keys,code):
 if not isinstance(value,dict) or set(value)!=set(keys): raise ApiError(400,code)
 return value
def actor(value,user_id):
 if valid_uuid(value)!=user_id: raise ApiError(403,'actor_mismatch')
def text(value,maximum,code,nullable=False):
 if value is None and nullable:return None
 if not isinstance(value,str) or not value.strip() or len(value.strip())>maximum:raise ApiError(400,code)
 return value.strip()
def nullable(value):return sql_text(value) if value is not None else 'NULL'
def report_input(value,ids):
 value=exact(value,tuple(ids)+('reason','details'),'invalid_report')
 if value['reason'] not in REASONS:raise ApiError(400,'invalid_reason')
 details=text(value['details'],2000,'invalid_details',True)
 return [text(value[key],128,'invalid_report') if key=='messageId' else valid_uuid(value[key]) for key in ids],value['reason'],details
def rpc(sql):return "WITH x AS MATERIALIZED (SELECT %s) SELECT json_build_object('ok',true) FROM x"%sql
def profile_sql(user_id):return "SELECT %s FROM public.profiles p WHERE p.id='%s'::uuid"%(PROFILE,user_id)

class ModerationApi:
 def __init__(self,auth=None,db=None):self.auth=auth or AuthResolver();self.db=db or PgWriteRunner()
 def handle(self,method,target,authorization,body=None):
  parsed=urlsplit(target)
  if parsed.fragment or parsed.netloc or parsed.scheme:raise ApiError(400,'invalid_path')
  user_id=self.auth.resolve(authorization)

  match=re.fullmatch(r'/v1/moderation/profiles/([0-9a-fA-F-]{36})',parsed.path)
  if method=='GET' and match:
   if parsed.query:raise ApiError(400,'invalid_query')
   return 200,{'item':self.db.query(user_id,profile_sql(valid_uuid(match.group(1))))}

  if method=='POST' and parsed.path.startswith('/v1/moderation/reports/'):
   kind=parsed.path.rsplit('/',1)[1]
   specs={
    'user':(('reportedUserId',),'public.report_user(%s,%s,%s)'),
    'item':(('itemId',),'public.report_item(%s,%s,%s)'),
    'deal':(('dealId',),'public.report_deal(%s,%s,%s)'),
    'story':(('storyId',),'public.report_story(%s,%s,%s)'),
    'deal-message':(('dealId','dealMessageId'),'public.report_deal_message(%s,%s,%s,%s)'),
    'direct-message':(('conversationId','messageId','reportedUserId'),'public.report_direct_message(%s,%s,%s,%s,%s)'),
   }
   if kind not in specs:raise ApiError(404,'not_found')
   keys,template=specs[kind];ids,reason,details=report_input(body,keys)
   args=["'%s'::uuid"%value for value in ids]
   if kind=='direct-message':args[1]=sql_text(body['messageId'])
   args.extend((sql_text(reason),nullable(details)))
   result=self.db.query(user_id,rpc(template%tuple(args)))
   return 200,{'ok':bool(result and result.get('ok'))}

  match=re.fullmatch(r'/v1/moderation/items/([0-9a-fA-F-]{36})/context',parsed.path)
  if method=='GET' and match:
   if parsed.query:raise ApiError(400,'invalid_query')
   item_id=valid_uuid(match.group(1));statement="""SELECT json_build_object('itemId',i.id,'title',coalesce(nullif(btrim(i.title),''),'عنصر بدون عنوان'),
    'ownerId',i.owner_id,'owner',(SELECT %s FROM public.profiles p WHERE p.id=i.owner_id)) FROM public.items i WHERE i.id='%s'::uuid"""%(PROFILE,item_id)
   return 200,{'item':self.db.query(user_id,statement)}

  if method=='POST' and parsed.path=='/v1/moderation/direct-context':
   value=exact(body,('conversationId','messageId','reportedUserId','currentUserId'),'invalid_context');actor(value['currentUserId'],user_id)
   conversation=valid_uuid(value['conversationId']);message=value['messageId'];reported=valid_uuid(value['reportedUserId'])
   if not isinstance(message,str) or not message or len(message)>128:raise ApiError(400,'invalid_context')
   statement="""WITH c AS(SELECT * FROM public.direct_conversations WHERE id='%s'::uuid),
    m AS(SELECT * FROM public.direct_messages WHERE id::text=%s AND conversation_id='%s'::uuid),
    x AS(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM c) THEN 'not_found'
      WHEN NOT EXISTS(SELECT 1 FROM c WHERE '%s'::uuid IN(participant_a,participant_b)) THEN 'unauthorized'
      WHEN NOT EXISTS(SELECT 1 FROM c WHERE '%s'::uuid=CASE WHEN participant_a='%s'::uuid THEN participant_b ELSE participant_a END) THEN 'invalid_target'
      WHEN NOT EXISTS(SELECT 1 FROM m) THEN 'not_found' WHEN EXISTS(SELECT 1 FROM m WHERE sender_id='%s'::uuid) THEN 'self_target'
      WHEN NOT EXISTS(SELECT 1 FROM m WHERE sender_id='%s'::uuid) THEN 'invalid_target'
      WHEN NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id='%s'::uuid) THEN 'invalid_target' ELSE 'ok' END state)
    SELECT json_build_object('state',x.state,'context',CASE WHEN x.state='ok' THEN json_build_object('conversationId','%s','messageId',%s,
      'reportedUser',(SELECT %s FROM public.profiles p WHERE p.id='%s'::uuid),'preview',(SELECT CASE WHEN message_type='voice' THEN 'رسالة صوتية داخل المحادثة المباشرة.'
      WHEN nullif(btrim(body),'') IS NULL THEN 'رسالة داخل المحادثة المباشرة.' ELSE left(body,120) END FROM m)) END) FROM x"""%(conversation,sql_text(message),conversation,user_id,reported,user_id,user_id,reported,reported,conversation,sql_text(message),PROFILE,reported)
   return self.context_result(self.db.query(user_id,statement))

  if method=='POST' and parsed.path=='/v1/moderation/deal-context':
   value=exact(body,('dealId','currentUserId'),'invalid_context');actor(value['currentUserId'],user_id);deal=valid_uuid(value['dealId'])
   statement="""WITH d AS(SELECT * FROM public.swap_deals WHERE id='%s'::uuid),x AS(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d) THEN 'not_found'
    WHEN NOT EXISTS(SELECT 1 FROM d WHERE '%s'::uuid IN(requester_id,offerer_id)) THEN 'unauthorized' ELSE 'ok' END state)
    SELECT json_build_object('state',x.state,'context',CASE WHEN x.state='ok' THEN (SELECT json_build_object('dealId',d.id,'reporterId','%s'::uuid,
      'reportedUser',(SELECT %s FROM public.profiles p WHERE p.id=CASE WHEN d.requester_id='%s'::uuid THEN d.offerer_id ELSE d.requester_id END)) FROM d) END) FROM x"""%(deal,user_id,user_id,PROFILE,user_id)
   return self.context_result(self.db.query(user_id,statement))

  if method=='POST' and parsed.path=='/v1/moderation/story-context':
   value=exact(body,('storyId','currentUserId'),'invalid_context');actor(value['currentUserId'],user_id);story=valid_uuid(value['storyId'])
   statement="""WITH s AS(SELECT * FROM public.stories WHERE id='%s'::uuid),x AS(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM s) THEN 'not_found'
    WHEN EXISTS(SELECT 1 FROM s WHERE user_id='%s'::uuid) THEN 'self_target' ELSE 'ok' END state)
    SELECT json_build_object('state',x.state,'context',CASE WHEN x.state='ok' THEN (SELECT json_build_object('storyId',s.id,
      'author',(SELECT %s FROM public.profiles p WHERE p.id=s.user_id),'caption',s.caption) FROM s) END) FROM x"""%(story,user_id,PROFILE)
   return self.context_result(self.db.query(user_id,statement))

  if method=='GET' and parsed.path=='/v1/moderation/admin':
   if parsed.query:raise ApiError(400,'invalid_query')
   result=self.db.query(user_id,"SELECT json_build_object('admin',public.is_admin_user())")
   return 200,{'admin':bool(result and result.get('admin'))}

  if method=='GET' and parsed.path=='/v1/moderation/admin/reports':
   query=parse_qs(parsed.query,keep_blank_values=True)
   if set(query)!={'status','type'} or any(len(v)!=1 for v in query.values()):raise ApiError(400,'invalid_query')
   status=query['status'][0];kind=query['type'][0]
   if status not in ('all',)+STATUSES or kind not in TYPES:raise ApiError(400,'invalid_filter')
   admin=self.db.query(user_id,"SELECT json_build_object('admin',public.is_admin_user())")
   if not admin or not admin.get('admin'):raise ApiError(403,'unauthorized')
   where=[]
   if status!='all':where.append('r.status=%s'%sql_text(status))
   filters={'user':'r.reported_user_id IS NOT NULL AND r.reported_item_id IS NULL AND r.story_id IS NULL AND r.reported_deal_id IS NULL AND r.reported_direct_conversation_id IS NULL AND r.reported_stream_message_id IS NULL AND r.reported_deal_message_id IS NULL','item':'r.reported_item_id IS NOT NULL','story':'r.story_id IS NOT NULL','deal':'r.reported_deal_id IS NOT NULL AND r.reported_deal_message_id IS NULL','direct_message':'(r.reported_direct_conversation_id IS NOT NULL OR r.reported_stream_message_id IS NOT NULL)','deal_message':'r.reported_deal_message_id IS NOT NULL'}
   if kind!='all':where.append(filters[kind])
   clause=' WHERE '+' AND '.join(where) if where else ''
   statement="""SELECT coalesce(json_agg(json_build_object('id',r.id,'reporterId',r.reporter_id,'reportedUserId',r.reported_user_id,
    'reportedItemId',r.reported_item_id,'reportedOfferId',r.reported_offer_id,'reportedDealId',r.reported_deal_id,
    'reportedDirectConversationId',r.reported_direct_conversation_id,'reportedStreamMessageId',r.reported_stream_message_id,
    'reportedDealMessageId',r.reported_deal_message_id,'storyId',r.story_id,'reason',r.reason,'details',r.details,'status',r.status,
    'actionTaken',r.action_taken,'adminNotes',r.admin_notes,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'createdAt',r.created_at,
    'reporterName',coalesce(pr.display_name,pr.username,r.reporter_id::text),'reportedUserName',coalesce(pt.display_name,pt.username,r.reported_user_id::text),
    'itemTitle',i.title) ORDER BY r.created_at DESC,r.id),'[]'::json) FROM (SELECT * FROM public.reports r%s ORDER BY created_at DESC LIMIT 100)r
    LEFT JOIN public.profiles pr ON pr.id=r.reporter_id LEFT JOIN public.profiles pt ON pt.id=r.reported_user_id LEFT JOIN public.items i ON i.id=r.reported_item_id"""%clause
   result=self.db.query(user_id,statement);return 200,{'items':result if isinstance(result,list) else []}

  if method=='POST' and parsed.path=='/v1/moderation/admin/review':
   value=exact(body,('reportId','status','actionTaken','adminNotes'),'invalid_review');report=valid_uuid(value['reportId'])
   if value['status'] not in STATUSES[1:]:raise ApiError(400,'invalid_review')
   action=text(value['actionTaken'],500,'invalid_review',True);notes=text(value['adminNotes'],2000,'invalid_review',True)
   result=self.db.query(user_id,rpc("public.review_report('%s'::uuid,%s,%s,%s)"%(report,sql_text(value['status']),nullable(action),nullable(notes))))
   return 200,{'ok':bool(result and result.get('ok'))}

  if method=='POST' and parsed.path=='/v1/moderation/admin/hide-item':
   value=exact(body,('itemId','reportId'),'invalid_hide');item=valid_uuid(value['itemId']);report=valid_uuid(value['reportId']) if value['reportId'] is not None else None
   result=self.db.query(user_id,rpc("public.hide_item_for_moderation('%s'::uuid,%s)"%(item,"'%s'::uuid"%report if report else 'NULL')))
   return 200,{'ok':bool(result and result.get('ok'))}
  raise ApiError(404,'not_found')

 @staticmethod
 def context_result(result):
  if not isinstance(result,dict):raise ApiError(503,'context_read_failed')
  state=result.get('state')
  if state!='ok':return 200,{'ok':False,'reason':state if state in ('not_found','unauthorized','invalid_target','self_target') else 'unknown'}
  if not isinstance(result.get('context'),dict):raise ApiError(404,'not_found')
  return 200,{'ok':True,'item':result['context']}
