import unittest

from oracle_contextual_messaging import ContextualMessagingApi
from oracle_domain_read import ApiError

USER='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
CONVERSATION='33333333-3333-4333-8333-333333333333'
MESSAGE='44444444-4444-4444-8444-444444444444'

class Auth:
    def resolve(self,value):
        if value!='Bearer session': raise ApiError(401,'invalid_session')
        return USER
class Db:
    def __init__(self,*values):self.values=list(values);self.calls=[]
    def query(self,user_id,statement):self.calls.append((user_id,statement));return self.values.pop(0)

class Tests(unittest.TestCase):
    def api(self,*values):
        db=Db(*values);return ContextualMessagingApi(Auth(),db),db
    def test_inbox_is_identity_bound_and_returns_contract(self):
        api,db=self.api([{'conversationId':CONVERSATION,'contextType':'story_reply','contextEntityId':MESSAGE,
          'otherParticipant':{'id':OTHER,'displayName':'Other','username':'other','avatarUrl':None},
          'latestMessage':None,'unreadCount':0,'lastActivityAt':'2026-09-08T00:00:00Z'}])
        status,body=api.handle('GET','/v1/contextual/conversations?userId='+USER,'Bearer session')
        self.assertEqual(status,200);self.assertEqual(body['items'][0]['conversationId'],CONVERSATION)
        self.assertIn("'%s'::uuid IN"%USER,db.calls[0][1])
        with self.assertRaises(ApiError):api.handle('GET','/v1/contextual/conversations?userId='+OTHER,'Bearer session')
    def test_text_insert_is_actor_bound_and_encoded(self):
        row={'id':MESSAGE,'conversationId':CONVERSATION,'senderId':USER,'body':'private','messageKind':'text',
             'mediaStoragePath':None,'mediaDurationMs':None,'createdAt':'2026-09-08T00:00:00Z'}
        api,db=self.api(row)
        status,body=api.handle('POST','/v1/contextual/conversations/'+CONVERSATION+'/messages','Bearer session',{'senderId':USER,'body':'private'})
        self.assertEqual(status,201);self.assertEqual(body['id'],MESSAGE);self.assertNotIn('private',db.calls[0][1])
    def test_voice_path_must_belong_to_actor_and_conversation(self):
        api,db=self.api()
        with self.assertRaises(ApiError) as error:
            api.handle('POST','/v1/contextual/conversations/'+CONVERSATION+'/voice','Bearer session',
              {'senderId':USER,'mediaStoragePath':'contextual/'+CONVERSATION+'/'+OTHER+'/voice.m4a','mediaDurationMs':1000})
        self.assertEqual(error.exception.code,'voice_not_owned');self.assertEqual(db.calls,[])
    def test_reply_uses_existing_rpc(self):
        api,db=self.api([{'conversation_id':CONVERSATION,'message_id':MESSAGE}])
        status,body=api.handle('POST','/v1/contextual/stories/'+MESSAGE+'/reply','Bearer session',{'body':'hello'})
        self.assertEqual((status,body['messageId']),(200,MESSAGE));self.assertIn('create_story_reply_thread',db.calls[0][1])
    def test_notification_uses_bound_rpc(self):
        api,db=self.api({'ok':True,'result':None})
        status,body=api.handle('POST','/v1/contextual/notifications','Bearer session',
          {'conversationId':CONVERSATION,'messageId':MESSAGE,'kind':'thread_message'})
        self.assertEqual((status,body),(200,{'ok':True}));self.assertIn('create_contextual_message_notification',db.calls[0][1])

if __name__=='__main__':unittest.main()
