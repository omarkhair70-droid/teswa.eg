import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('exchange',Path(__file__).with_name('oracle_exchange.py'))
exchange=importlib.util.module_from_spec(spec); spec.loader.exec_module(exchange)
UID='11111111-1111-4111-8111-111111111111'; OTHER='22222222-2222-4222-8222-222222222222'; A='33333333-3333-4333-8333-333333333333'; B='44444444-4444-4444-8444-444444444444'; O='55555555-5555-4555-8555-555555555555'; D='66666666-6666-4666-8666-666666666666'
class Auth:
 def resolve(self,x): return UID
class DB:
 def __init__(self,out): self.out=out; self.calls=[]
 def query(self,u,s): self.calls.append((u,s)); return self.out
class Tests(unittest.TestCase):
 def test_offer_create_is_atomic_and_identity_bound(self):
  db=DB({'offerId':O,'eventRecorded':True}); body={'requestedItemId':A,'offeredItemId':B,'senderId':UID,'receiverId':OTHER,'message':'swap'}
  self.assertEqual(exchange.ExchangeApi(Auth(),db).handle('POST','/v1/offers','x',body)[0],201)
  self.assertIn('INSERT INTO public.offers',db.calls[0][1]); self.assertIn('INSERT INTO public.offer_events',db.calls[0][1])
  body['senderId']=OTHER
  with self.assertRaises(exchange.ApiError) as error: exchange.ExchangeApi(Auth(),DB({})).handle('POST','/v1/offers','x',body)
  self.assertEqual(error.exception.status,403)
 def test_accept_calls_existing_rpc(self):
  db=DB({'dealId':D}); status,out=exchange.ExchangeApi(Auth(),db).handle('POST','/v1/offers/'+O+'/accept','x',{})
  self.assertEqual((status,out),(200,{'dealId':D})); self.assertIn('public.accept_offer',db.calls[0][1])
 def test_message_insert_is_rls_identity_bound_and_encoded(self):
  db=DB({'dealId':D,'senderId':UID}); status,_=exchange.ExchangeApi(Auth(),db).handle('POST','/v1/deals/'+D+'/messages','x',{'senderId':UID,'body':"hi'); DROP TABLE x;--"})
  self.assertEqual(status,201); self.assertNotIn('DROP TABLE',db.calls[0][1]); self.assertIn("decode('",db.calls[0][1])
if __name__=='__main__':unittest.main()
