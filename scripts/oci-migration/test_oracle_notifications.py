import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('notifications',Path(__file__).with_name('oracle_notifications.py'))
notifications=importlib.util.module_from_spec(spec); spec.loader.exec_module(notifications)
UID='11111111-1111-4111-8111-111111111111'; OTHER='22222222-2222-4222-8222-222222222222'; NID='33333333-3333-4333-8333-333333333333'
class Auth:
 def resolve(self,x): return UID
class DB:
 def __init__(self,result): self.result=result; self.calls=[]
 def query(self,u,s): self.calls.append((u,s)); return self.result
class Tests(unittest.TestCase):
 def test_list_and_unread_are_identity_bound(self):
  reads=DB([]); api=notifications.NotificationsApi(Auth(),reads,DB({}))
  self.assertEqual(api.handle('GET','/v1/notifications?limit=20','x')[1],{'items':[]})
  self.assertIn(UID,reads.calls[-1][1]); reads.result=3
  self.assertEqual(api.handle('GET','/v1/notifications/unread','x')[1],{'count':3})
 def test_mark_read_rejects_spoofed_actor(self):
  api=notifications.NotificationsApi(Auth(),DB({}),DB({'ok':True,'found':True}))
  with self.assertRaises(notifications.ApiError) as error:
   api.handle('POST','/v1/notifications/read','x',{'userId':OTHER,'notificationId':NID})
  self.assertEqual(error.exception.status,403)
 def test_preferences_validate_and_call_existing_rpc(self):
  writes=DB({'offersEnabled':True}); api=notifications.NotificationsApi(Auth(),DB({}),writes)
  out=api.handle('POST','/v1/notifications/preferences','x',{'offersEnabled':True,'quietHoursStart':'23:00'})[1]
  self.assertTrue(out['offersEnabled']); self.assertIn('update_my_notification_preferences',writes.calls[-1][1])
  with self.assertRaises(notifications.ApiError): api.handle('POST','/v1/notifications/preferences','x',{'quietHoursStart':'9pm'})
 def test_dispatch_uses_existing_guarded_rpc_and_encoded_copy(self):
  writes=DB({'ok':True}); api=notifications.NotificationsApi(Auth(),DB({}),writes)
  body={'targetUserId':OTHER,'type':'offer_received','title':"x'); DROP TABLE notifications;--",'body':None,'itemId':NID,'offerId':None,'dealId':None,'messageId':None}
  self.assertEqual(api.handle('POST','/v1/notifications/dispatch','x',body)[1],{'accepted':True})
  self.assertIn('public.create_notification',writes.calls[-1][1]); self.assertNotIn('DROP TABLE',writes.calls[-1][1])
if __name__=='__main__':unittest.main()
