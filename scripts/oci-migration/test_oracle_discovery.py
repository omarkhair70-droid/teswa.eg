import unittest
from oracle_discovery import DiscoveryApi
from oracle_domain_read import ApiError
USER='11111111-1111-4111-8111-111111111111'
class Auth:
 def resolve(self,value):
  if value!='Bearer session':raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,*values):self.values=list(values);self.calls=[]
 def query(self,user_id,sql):self.calls.append((user_id,sql));return self.values.pop(0)
class Tests(unittest.TestCase):
 def test_combines_existing_rpc_and_rls_reads(self):
  db=Db([],[],[{'id':USER,'swaps':1,'createdAt':'now'}],[{'id':USER,'author':{'id':USER},'storiesCount':1,'latestCreatedAt':'now'}]);api=DiscoveryApi(Auth(),db)
  status,body=api.handle('POST','/v1/discovery/city-pulse','Bearer session',{'matchTerms':['Cairo'],'movingItemsLimit':5,'storyItemsLimit':6,'peopleLimit':7,'storyAuthorsLimit':8})
  self.assertEqual(status,200);self.assertEqual(body['people'][0],{'id':USER});self.assertNotIn('id',body['activeStoryAuthors'][0])
  self.assertIn('get_public_city_pulse_moving_items',db.calls[0][1]);self.assertTrue(all(call[0]==USER for call in db.calls))
 def test_invalid_terms_and_limits_never_query(self):
  for payload in ({'matchTerms':['x'],'movingItemsLimit':0,'storyItemsLimit':1,'peopleLimit':1,'storyAuthorsLimit':1},
                  {'matchTerms':[1],'movingItemsLimit':1,'storyItemsLimit':1,'peopleLimit':1,'storyAuthorsLimit':1}):
   db=Db();api=DiscoveryApi(Auth(),db)
   with self.assertRaises(ApiError):api.handle('POST','/v1/discovery/city-pulse','Bearer session',payload)
   self.assertEqual(db.calls,[])
 def test_terms_are_encoded_not_interpolated(self):
  db=Db([],[],[],[]);api=DiscoveryApi(Auth(),db);term="%' OR true --"
  api.handle('POST','/v1/discovery/city-pulse','Bearer session',{'matchTerms':[term],'movingItemsLimit':1,'storyItemsLimit':1,'peopleLimit':1,'storyAuthorsLimit':1})
  self.assertTrue(all(term not in call[1] for call in db.calls))
if __name__=='__main__':unittest.main()
