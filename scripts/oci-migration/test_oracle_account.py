import unittest
from oracle_account import AccountApi
from oracle_domain_read import ApiError

USER='11111111-1111-4111-8111-111111111111'
class Auth:
 def resolve(self,value):
  if value!='Bearer session':raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,*values):self.values=list(values);self.calls=[]
 def query(self,user_id,sql):self.calls.append((user_id,sql));return self.values.pop(0)
class Storage:
 def __init__(self,fail=False):self.deleted=[];self.fail=fail
 def delete(self,name):
  self.deleted.append(name)
  if self.fail:raise ApiError(503,'media_storage_unavailable')
class Tests(unittest.TestCase):
 def test_request_deletes_media_then_identity(self):
  db=Db({'objects':['item-images/a','direct-chat-media/b','item-images/a']},{'deleted':True});storage=Storage()
  status,result=AccountApi(Auth(),db,storage).handle('POST','/v1/account/deletion-request','Bearer session',{})
  self.assertEqual(status,200);self.assertTrue(result['ok'])
  self.assertEqual(storage.deleted,['item-images/a','direct-chat-media/b'])
  self.assertIn("'%s'::uuid"%USER,db.calls[0][1])
  self.assertIn('teswa_account.delete_current_user()',db.calls[1][1])
 def test_storage_failure_preserves_relational_identity(self):
  db=Db({'objects':['item-images/a']});storage=Storage(True)
  with self.assertRaises(ApiError) as error:AccountApi(Auth(),db,storage).handle('POST','/v1/account/deletion-request','Bearer session',{})
  self.assertEqual(error.exception.code,'media_storage_unavailable');self.assertEqual(len(db.calls),1)
 def test_relational_rejection_is_not_success(self):
  db=Db({'objects':[]},{'deleted':False})
  with self.assertRaises(ApiError) as error:AccountApi(Auth(),db,Storage()).handle('POST','/v1/account/deletion-request','Bearer session',{})
  self.assertEqual(error.exception.code,'account_deletion_rejected')
 def test_request_rejects_client_fields(self):
  db=Db({'objects':[]})
  with self.assertRaises(ApiError):AccountApi(Auth(),db).handle('POST','/v1/account/deletion-request','Bearer session',{'userId':USER})
  self.assertEqual(db.calls,[])
if __name__=='__main__':unittest.main()
