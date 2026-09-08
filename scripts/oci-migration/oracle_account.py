"""Authenticated Oracle account deletion request boundary."""
from __future__ import annotations

from urllib.parse import urlsplit

from oracle_domain_read import ApiError, AuthResolver
from oracle_marketplace_write import PgWriteRunner


class AccountApi:
 def __init__(self,auth=None,db=None):self.auth=auth or AuthResolver();self.db=db or PgWriteRunner()
 def handle(self,method,target,authorization,body=None):
  parsed=urlsplit(target)
  if method!='POST' or parsed.path!='/v1/account/deletion-request' or parsed.query or parsed.fragment or parsed.netloc or parsed.scheme:raise ApiError(404,'not_found')
  if not isinstance(body,dict) or body:raise ApiError(400,'invalid_deletion_request')
  user_id=self.auth.resolve(authorization)
  statement="""WITH x AS (INSERT INTO public.account_deletion_requests(user_id,request_source)
    VALUES('%s'::uuid,'authenticated_profile') RETURNING id) SELECT json_build_object('queued',EXISTS(SELECT 1 FROM x))"""%user_id
  result=self.db.query(user_id,statement)
  if not result or not result.get('queued'):raise ApiError(409,'deletion_request_rejected')
  return 202,{'ok':True,'message':'تم استلام طلب حذف الحساب وسيتم تنفيذه بأمان.','errorCode':None}
