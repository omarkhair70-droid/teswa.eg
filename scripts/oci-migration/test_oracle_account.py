import unittest
from oracle_account import AccountApi
from oracle_domain_read import ApiError

USER='11111111-1111-4111-8111-111111111111'
class Auth:
 def resolve(self,value):
  if value!='Bearer session':raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,value):self.value=value;self.calls=[]
 def query(self,user_id,sql):self.calls.append((user_id,sql));return self.value
class Tests(unittest.TestCase):
 def test_request_is_identity_bound_and_queued(self):
  db=Db({'queued':True});status,result=AccountApi(Auth(),db).handle('POST','/v1/account/deletion-request','Bearer session',{})
  self.assertEqual(status,202);self.assertTrue(result['ok']);self.assertIn("'%s'::uuid"%USER,db.calls[0][1]);self.assertIn("'authenticated_profile'",db.calls[0][1])
 def test_request_rejects_client_fields(self):
  db=Db({'queued':True})
  with self.assertRaises(ApiError):AccountApi(Auth(),db).handle('POST','/v1/account/deletion-request','Bearer session',{'userId':USER})
  self.assertEqual(db.calls,[])
if __name__=='__main__':unittest.main()
