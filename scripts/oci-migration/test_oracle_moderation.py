import unittest
from oracle_domain_read import ApiError
from oracle_moderation import ModerationApi

USER='11111111-1111-4111-8111-111111111111';OTHER='22222222-2222-4222-8222-222222222222';ITEM='33333333-3333-4333-8333-333333333333';REPORT='44444444-4444-4444-8444-444444444444'
class Auth:
 def resolve(self,value):
  if value!='Bearer session':raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,*values):self.values=list(values);self.calls=[]
 def query(self,user_id,sql):self.calls.append((user_id,sql));return self.values.pop(0)
class Tests(unittest.TestCase):
 def api(self,*values):db=Db(*values);return ModerationApi(Auth(),db),db
 def test_reports_call_existing_rpc_with_validated_reason(self):
  api,db=self.api({'ok':True});status,result=api.handle('POST','/v1/moderation/reports/item','Bearer session',{'itemId':ITEM,'reason':'fraud','details':"it's wrong"})
  self.assertEqual((status,result),(200,{'ok':True}));self.assertIn('public.report_item',db.calls[0][1]);self.assertNotIn("it's wrong",db.calls[0][1])
  with self.assertRaises(ApiError) as error:api.handle('POST','/v1/moderation/reports/item','Bearer session',{'itemId':ITEM,'reason':'invalid','details':None})
  self.assertEqual(error.exception.code,'invalid_reason');self.assertEqual(len(db.calls),1)
 def test_context_actor_spoofing_never_queries(self):
  api,db=self.api()
  with self.assertRaises(ApiError):api.handle('POST','/v1/moderation/deal-context','Bearer session',{'dealId':ITEM,'currentUserId':OTHER})
  self.assertEqual(db.calls,[])
 def test_context_reasons_are_preserved(self):
  for reason in ('not_found','unauthorized','invalid_target','self_target'):
   api,_=self.api({'state':reason,'context':None});status,result=api.handle('POST','/v1/moderation/story-context','Bearer session',{'storyId':ITEM,'currentUserId':USER})
   self.assertEqual((status,result),(200,{'ok':False,'reason':reason}))
 def test_admin_queue_requires_admin_before_data_query(self):
  api,db=self.api({'admin':False})
  with self.assertRaises(ApiError) as error:api.handle('GET','/v1/moderation/admin/reports?status=open&type=all','Bearer session')
  self.assertEqual(error.exception.status,403);self.assertEqual(len(db.calls),1)
 def test_admin_queue_is_bounded(self):
  api,db=self.api({'admin':True},[]);status,result=api.handle('GET','/v1/moderation/admin/reports?status=all&type=item','Bearer session')
  self.assertEqual((status,result),(200,{'items':[]}));self.assertIn('LIMIT 100',db.calls[1][1])
if __name__=='__main__':unittest.main()
