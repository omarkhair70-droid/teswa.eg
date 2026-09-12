"""Authenticated deal reviews against the existing RLS-protected tables."""
import re
from urllib.parse import urlsplit
from oracle_domain_read import ApiError,AuthResolver,PgReadRunner,sql_text,valid_uuid
from oracle_marketplace_write import PgWriteRunner

class ReviewsApi:
 def __init__(self,auth=None,reads=None,writes=None):self.auth=auth or AuthResolver();self.reads=reads or PgReadRunner();self.writes=writes or PgWriteRunner()
 def handle(self,method,target,authorization,body=None):
  parsed=urlsplit(target)
  if parsed.query or parsed.fragment or parsed.netloc or parsed.scheme:raise ApiError(400,'invalid_path')
  user=self.auth.resolve(authorization)
  match=re.fullmatch(r'/v1/reviews/deals/([0-9a-fA-F-]{36})',parsed.path)
  if method=='GET' and match:
   deal=valid_uuid(match.group(1));sql="""SELECT CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object(
    'dealId',d.id,'status',d.status,'reviewerId','%s'::uuid,'revieweeId',CASE WHEN d.requester_id='%s'::uuid THEN d.offerer_id ELSE d.requester_id END,
    'reviewee',json_build_object('id',p.id,'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url,'successfulSwapsCount',p.successful_swaps_count,'responseRate',p.response_rate),
    'existingReview',CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id',r.id,'rating',r.rating,'comment',r.comment,'clearDescription',r.clear_description,'goodCommunication',r.good_communication,'onTime',r.on_time,'respectfulSwapper',r.respectful_swapper,'createdAt',r.created_at) END) END
    FROM public.swap_deals d LEFT JOIN public.profiles p ON p.id=CASE WHEN d.requester_id='%s'::uuid THEN d.offerer_id ELSE d.requester_id END
    LEFT JOIN public.reviews r ON r.deal_id=d.id AND r.reviewer_id='%s'::uuid AND r.reviewee_id=p.id WHERE d.id='%s'::uuid AND '%s'::uuid IN(d.requester_id,d.offerer_id)"""%(user,user,user,user,deal,user)
   row=self.reads.query(user,sql)
   if row is None:raise ApiError(404,'not_found')
   if str(row.pop('status'))!='completed':raise ApiError(409,'deal_not_completed')
   row.pop('revieweeId',None);return 200,row
  if method!='POST' or parsed.path!='/v1/reviews' or not isinstance(body,dict):raise ApiError(404,'not_found')
  expected={'dealId','reviewerId','revieweeId','rating','comment','clearDescription','goodCommunication','onTime','respectfulSwapper'}
  if set(body)!=expected or valid_uuid(body['reviewerId'])!=user:raise ApiError(403,'actor_mismatch')
  deal,reviewee=valid_uuid(body['dealId']),valid_uuid(body['revieweeId']);rating=body['rating']
  if not isinstance(rating,int) or isinstance(rating,bool) or not 1<=rating<=5:raise ApiError(400,'invalid_rating')
  for key in ('clearDescription','goodCommunication','onTime','respectfulSwapper'):
   if not isinstance(body[key],bool):raise ApiError(400,'invalid_review')
  comment=body['comment']
  if comment is not None and (not isinstance(comment,str) or len(comment.strip())>1000):raise ApiError(400,'invalid_comment')
  values=["'%s'::uuid"%deal,"'%s'::uuid"%user,"'%s'::uuid"%reviewee,str(rating),sql_text(comment.strip()) if comment and comment.strip() else 'NULL']+[('true' if body[k] else 'false') for k in ('clearDescription','goodCommunication','onTime','respectfulSwapper')]
  sql="""WITH x AS (INSERT INTO public.reviews(deal_id,reviewer_id,reviewee_id,rating,comment,clear_description,good_communication,on_time,respectful_swapper)
   VALUES(%s) RETURNING 1) SELECT json_build_object('ok',EXISTS(SELECT 1 FROM x))"""%','.join(values)
  result=self.writes.query(user,sql)
  if result.get('ok') is not True:raise ApiError(409,'review_rejected')
  return 201,{'ok':True}
