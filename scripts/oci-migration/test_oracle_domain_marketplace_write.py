import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('write',Path(__file__).with_name('oracle_marketplace_write.py'))
write=importlib.util.module_from_spec(spec); spec.loader.exec_module(write)
UID='11111111-1111-4111-8111-111111111111'; IID='22222222-2222-4222-8222-222222222222'; CID='33333333-3333-4333-8333-333333333333'

class Auth:
    def resolve(self,value):
        if value!='Bearer valid': raise write.ApiError(401,'invalid_session')
        return UID
class DB:
    def __init__(self): self.calls=[]
    def query(self,user,sql): self.calls.append((user,sql)); return {'itemId':IID,'imagesInserted':1}

def body():
    return {'itemId':IID,'ownerId':UID,'title':'كتاب','categoryId':CID,'description':None,
      'condition':'good_used','conditionNotes':None,'city':'القاهرة','area':None,
      'locationLatitude':30.1,'locationLongitude':31.2,'desireMode':'flexible','desireText':None,
      'itemStory':None,'swapReason':None,'goodFor':None,
      'images':[{'imageUrl':'https://object.example/p/read#teswa-object=item_image:items/x','isPrimary':True,'sortOrder':0}]}

class WriteTests(unittest.TestCase):
    def test_publish_uses_authenticated_owner_and_atomic_sql(self):
        db=DB(); status,out=write.MarketplaceWriteApi(Auth(),db).handle('POST','/v1/marketplace/items','Bearer valid',body())
        self.assertEqual((status,out),(201,{'itemId':IID})); self.assertEqual(db.calls[0][0],UID)
        self.assertIn('WITH p AS',db.calls[0][1]); self.assertIn('INSERT INTO public.items',db.calls[0][1]); self.assertIn('INSERT INTO public.item_images',db.calls[0][1])
    def test_owner_spoof_and_invalid_images_never_query(self):
        for mutate in ('owner','image'):
            value=body()
            if mutate=='owner': value['ownerId']='44444444-4444-4444-8444-444444444444'
            else: value['images'][0]['imageUrl']='http://not-secure.test/x'
            db=DB()
            with self.subTest(mutate=mutate),self.assertRaises(write.ApiError):
                write.MarketplaceWriteApi(Auth(),db).handle('POST','/v1/marketplace/items','Bearer valid',value)
            self.assertEqual(db.calls,[])
    def test_text_is_base64_encoded_out_of_sql(self):
        value=body(); value['title']="x'); DROP TABLE public.items; --"
        sql=write.publish_sql(write.publish_input(value,UID))
        self.assertNotIn('DROP TABLE',sql); self.assertIn("decode('",sql)
    def test_runner_sets_rls_identity_in_write_transaction(self):
        class Result: returncode=0; stdout=UID+'\n{"itemId":"'+IID+'","imagesInserted":1}\n'
        with patch.dict(write.os.environ,{'TESWA_DOMAIN_DATABASE_URL':'postgresql://local/test'}),patch.object(write.subprocess,'run',return_value=Result()) as run:
            out=write.PgWriteRunner(psql='psql').query(UID,"SELECT json_build_object('ok',true)")
        sql=run.call_args.kwargs['input']; self.assertIn('BEGIN;',sql); self.assertNotIn('READ ONLY',sql)
        self.assertIn('SET LOCAL ROLE teswa_app_authenticated',sql); self.assertIn("set_config('teswa.user_id'",sql)
        self.assertEqual(out['imagesInserted'],1)
if __name__=='__main__': unittest.main()
