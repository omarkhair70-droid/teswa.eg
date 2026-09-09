import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('reviews',Path(__file__).with_name('oracle_reviews.py'));reviews=importlib.util.module_from_spec(spec);spec.loader.exec_module(reviews)
U='11111111-1111-4111-8111-111111111111';O='22222222-2222-4222-8222-222222222222';D='33333333-3333-4333-8333-333333333333'
class A:
 def resolve(self,x):return U
class DB:
 def __init__(self,r):self.r=r;self.calls=[]
 def query(self,u,s):self.calls.append((u,s));return self.r
class T(unittest.TestCase):
 def test_completed_context_is_identity_bound(self):
  r={'dealId':D,'status':'completed','reviewerId':U,'revieweeId':O,'reviewee':{'id':O},'existingReview':None};db=DB(r)
  out=reviews.ReviewsApi(A(),db,DB({})).handle('GET','/v1/reviews/deals/'+D,'x')[1]
  self.assertNotIn('status',out);self.assertEqual(out['reviewerId'],U);self.assertIn(U,db.calls[0][1])
 def test_insert_validates_actor_and_encodes_comment(self):
  db=DB({'ok':True});api=reviews.ReviewsApi(A(),DB({}),db);body={'dealId':D,'reviewerId':U,'revieweeId':O,'rating':5,'comment':"x'); DROP TABLE reviews;--",'clearDescription':True,'goodCommunication':True,'onTime':True,'respectfulSwapper':True}
  self.assertEqual(api.handle('POST','/v1/reviews','x',body),(201,{'ok':True}));self.assertNotIn('DROP TABLE',db.calls[0][1])
  with self.assertRaises(reviews.ApiError):api.handle('POST','/v1/reviews','x',{**body,'reviewerId':O})
if __name__=='__main__':unittest.main()
