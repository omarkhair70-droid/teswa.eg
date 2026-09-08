import unittest
from oracle_domain_read import ApiError
from oracle_stories import StoriesApi

USER='11111111-1111-4111-8111-111111111111';OTHER='22222222-2222-4222-8222-222222222222';STORY='33333333-3333-4333-8333-333333333333'
class Auth:
 def resolve(self,value):
  if value!='Bearer session':raise ApiError(401,'invalid_session')
  return USER
class Db:
 def __init__(self,*values):self.values=list(values);self.calls=[]
 def query(self,user_id,sql):self.calls.append((user_id,sql));return self.values.pop(0)
class Tests(unittest.TestCase):
 def api(self,*values):db=Db(*values);return StoriesApi(Auth(),db),db
 def test_create_is_actor_and_storage_bound(self):
  api,db=self.api({'storyId':STORY});payload={'userId':USER,'mediaType':'image','mediaStoragePath':USER+'/story.jpg','mediaThumbnailStoragePath':None,'caption':'hello','durationMs':None,'width':100,'height':100}
  status,body=api.handle('POST','/v1/stories','Bearer session',payload);self.assertEqual((status,body['storyId']),(201,STORY));self.assertNotIn('hello',db.calls[0][1])
  payload['mediaStoragePath']=OTHER+'/story.jpg'
  with self.assertRaises(ApiError) as error:api.handle('POST','/v1/stories','Bearer session',payload)
  self.assertEqual(error.exception.code,'story_media_not_owned')
 def test_delete_returns_only_owned_storage_paths(self):
  api,db=self.api({'found':True,'storagePaths':[USER+'/story.jpg']});status,body=api.handle('POST','/v1/stories/'+STORY+'/delete','Bearer session',{'userId':USER})
  self.assertEqual((status,body['storagePaths']),(200,[USER+'/story.jpg']));self.assertIn("user_id='%s'::uuid"%USER,db.calls[0][1])
 def test_like_and_view_spoofing_never_query(self):
  api,db=self.api()
  with self.assertRaises(ApiError):api.handle('POST','/v1/stories/'+STORY+'/like','Bearer session',{'likerId':OTHER,'liked':True})
  with self.assertRaises(ApiError):api.handle('POST','/v1/stories/'+STORY+'/view','Bearer session',{'viewerId':OTHER})
  self.assertEqual(db.calls,[])
 def test_home_and_video_drops_are_bounded_reads(self):
  api,db=self.api([],[]);self.assertEqual(api.handle('GET','/v1/stories/home','Bearer session')[1],{'items':[]})
  self.assertEqual(api.handle('GET','/v1/stories/video-drops?limit=10','Bearer session')[1],{'items':[]});self.assertIn('LIMIT 10',db.calls[1][1])
 def test_like_state_requires_authenticated_viewer(self):
  api,db=self.api()
  with self.assertRaises(ApiError):api.handle('GET','/v1/stories/likes?viewerId='+OTHER+'&ids='+STORY,'Bearer session')
  self.assertEqual(db.calls,[])
if __name__=='__main__':unittest.main()
