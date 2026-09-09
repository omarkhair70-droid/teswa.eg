import unittest

from oracle_domain_read import ApiError
from oracle_dolab import DolabApi

USER='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
ITEM='33333333-3333-4333-8333-333333333333'
MEDIA='44444444-4444-4444-8444-444444444444'

class Auth:
 def resolve(self,value):
  if value!='Bearer session': raise ApiError(401,'invalid_session')
  return USER

class Db:
 def __init__(self,*values): self.values=list(values); self.calls=[]
 def query(self,user_id,sql): self.calls.append((user_id,sql)); return self.values.pop(0)

class Tests(unittest.TestCase):
 def api(self,*values):
  db=Db(*values); return DolabApi(Auth(),db),db

 def test_create_item_is_actor_bound_and_escapes_text(self):
  row={'id':ITEM,'user_id':USER}
  api,db=self.api(row)
  body={'userId':USER,'input':{'title':"O'Reilly",'description':None,'category':None,'condition':None,'exchangeIntent':None,'status':'draft','source':'manual'}}
  status,result=api.handle('POST','/v1/dolab/items','Bearer session',body)
  self.assertEqual((status,result['item']), (201,row)); self.assertNotIn("O'Reilly",db.calls[0][1])
  body['userId']=OTHER
  with self.assertRaises(ApiError): api.handle('POST','/v1/dolab/items','Bearer session',body)
  self.assertEqual(len(db.calls),1)

 def test_create_media_requires_owned_storage(self):
  api,db=self.api({'id':MEDIA,'user_id':USER})
  value={'dolabItemId':None,'mediaType':'image','storagePath':USER+'/inbox/photo.jpg','durationMs':None,'width':100,'height':100,'mimeType':'image/jpeg','sizeBytes':20,'sortOrder':0}
  self.assertEqual(api.handle('POST','/v1/dolab/media','Bearer session',{'userId':USER,'input':value})[0],201)
  value['storagePath']=OTHER+'/photo.jpg'
  with self.assertRaises(ApiError) as error: api.handle('POST','/v1/dolab/media','Bearer session',{'userId':USER,'input':value})
  self.assertEqual(error.exception.code,'dolab_media_not_owned'); self.assertEqual(len(db.calls),1)

 def test_attach_preserves_contract_states_and_not_found(self):
  for state in ('linked','already_linked','linked_elsewhere'):
   api,_=self.api({'state':state}); status,result=api.handle('POST','/v1/dolab/media/'+MEDIA+'/attach','Bearer session',{'userId':USER,'dolabItemId':ITEM})
   self.assertEqual((status,result['state']),(200,state))
  api,_=self.api({'state':'not_found'})
  with self.assertRaises(ApiError) as error: api.handle('POST','/v1/dolab/media/'+MEDIA+'/attach','Bearer session',{'userId':USER,'dolabItemId':ITEM})
  self.assertEqual((error.exception.status,error.exception.code),(404,'not_found'))

 def test_lists_require_matching_actor(self):
  api,db=self.api([]); self.assertEqual(api.handle('GET','/v1/dolab/items?userId='+USER,'Bearer session')[1],{'items':[]})
  with self.assertRaises(ApiError): api.handle('GET','/v1/dolab/items?userId='+OTHER,'Bearer session')
  self.assertEqual(len(db.calls),1)

 def test_publish_source_is_owned_and_ordered(self):
  api,db=self.api({'item':None,'media':[]})
  status,result=api.handle('GET','/v1/dolab/items/'+ITEM+'/publish-source?userId='+USER,'Bearer session')
  self.assertEqual((status,result),(200,{'item':None,'media':[]})); self.assertIn("user_id='%s'::uuid"%USER,db.calls[0][1])

if __name__=='__main__': unittest.main()
