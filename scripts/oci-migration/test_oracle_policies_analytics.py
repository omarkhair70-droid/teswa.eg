import unittest

from oracle_domain_read import ApiError
from oracle_policies_analytics import PoliciesAnalyticsApi

USER='11111111-1111-4111-8111-111111111111'; OTHER='22222222-2222-4222-8222-222222222222'

class Auth:
 def resolve(self,value):
  if value!='Bearer session': raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,*values): self.values=list(values); self.calls=[]
 def query(self,user_id,sql): self.calls.append((user_id,sql)); return self.values.pop(0)

class Tests(unittest.TestCase):
 def api(self,*values): db=Db(*values); return PoliciesAnalyticsApi(Auth(),db),db
 def test_policy_reads_and_writes_are_actor_bound(self):
  api,db=self.api([],{'ok':True})
  self.assertEqual(api.handle('GET','/v1/policies/acceptances?userId='+USER+'&keys=terms_of_use','Bearer session')[1],{'items':[]})
  status,result=api.handle('POST','/v1/policies/acceptances','Bearer session',{'userId':USER,'policies':[{'policyKey':'terms_of_use','policyVersion':'2026-09'}]})
  self.assertEqual((status,result),(200,{'ok':True}))
  with self.assertRaises(ApiError): api.handle('GET','/v1/policies/acceptances?userId='+OTHER+'&keys=terms_of_use','Bearer session')
  self.assertEqual(len(db.calls),2)
 def test_policy_keys_are_allowlisted_before_query(self):
  api,db=self.api()
  with self.assertRaises(ApiError): api.handle('GET','/v1/policies/acceptances?userId='+USER+'&keys=admin','Bearer session')
  self.assertEqual(db.calls,[])
 def test_analytics_uses_existing_rpc_and_bounded_json(self):
  api,db=self.api({'ok':True})
  context={'sessionId':'session','route':'/home','entityType':None,'entityId':None,'metadata':{'source':'live'},'appVersion':'1.0','platform':'android'}
  status,result=api.handle('POST','/v1/analytics/events','Bearer session',{'eventName':'home_viewed','context':context})
  self.assertEqual((status,result),(200,{'accepted':True,'reason':None})); self.assertIn('public.track_analytics_event',db.calls[0][1]); self.assertNotIn('"source":"live"',db.calls[0][1])
 def test_invalid_analytics_shape_never_queries(self):
  api,db=self.api()
  with self.assertRaises(ApiError): api.handle('POST','/v1/analytics/events','Bearer session',{'eventName':'home_viewed','context':{}})
  self.assertEqual(db.calls,[])

if __name__=='__main__': unittest.main()
