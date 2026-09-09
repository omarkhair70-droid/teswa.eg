import base64
import http.client
import importlib.util
import json
import re
import threading
import unittest
from pathlib import Path

from oracle_domain_read import ApiError
from oracle_marketplace_image_plan import MarketplaceImagePlanApi, normalize_plan
from oracle_marketplace_edit import MarketplaceEditApi
from oracle_domain_service import Server

UID='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
ITEM='33333333-3333-4333-8333-333333333333'
IMAGE='44444444-4444-4444-8444-444444444444'
KEY=UID+'/new.jpg'
URL='https://untrusted.example.test/old#teswa-object=item_image:'+KEY


def plan(rows=None, **changes):
    value={'itemId':ITEM,'ownerId':UID,'orderedRows':rows if rows is not None else [{'kind':'existing','imageId':IMAGE,'imageUrl':'https://legacy.example.test/old.jpg'}]}
    value.update(changes)
    return value


class Auth:
    def resolve(self,authorization):
        if authorization!='Bearer valid': raise ApiError(401,'invalid_session')
        return UID


class DB:
    def __init__(self,result): self.result=result; self.calls=[]
    def query(self,user_id,statement):
        self.calls.append((user_id,statement))
        return self.result


class Storage:
    def __init__(self):
        self.calls=[]; self.found={'sizeBytes':12,'contentType':'image/jpeg'}
    def head(self,name): self.calls.append(('head',name)); return self.found
    def par(self,name,access,seconds,label):
        self.calls.append(('par',name,access,seconds,label))
        return 'https://objectstorage.example.test/p/verified'
    def delete(self,*args): raise AssertionError('Image metadata update must not delete objects')


class ImagePlanTests(unittest.TestCase):
    def setUp(self):
        self.reads=DB({'status':'active'}); self.writes=DB({'code':'updated','removedImageUrls':['https://legacy.example.test/old.jpg']})
        self.storage=Storage()
        self.api=MarketplaceImagePlanApi(Auth(),self.reads,self.writes,self.storage)

    def call(self,body=None,method='POST',authorization='Bearer valid'):
        return self.api.handle(method,'/v1/marketplace/items/'+ITEM+'/edit/images/plan',authorization,plan() if body is None else body)

    def test_existing_image_plan_preserves_exact_identity_and_url(self):
        value=normalize_plan(plan(),ITEM,UID)
        self.assertEqual(value['orderedRows'][0]['imageId'],IMAGE)
        self.assertEqual(self.call()[1]['removedImageUrls'],['https://legacy.example.test/old.jpg'])
        self.assertEqual(self.storage.calls,[])
        actor,statement=self.writes.calls[-1]
        self.assertEqual(actor,UID)
        self.assertIn('teswa_runtime.apply_owned_listing_image_plan',statement)
        encoded=re.search(r"decode\('([^']+)','base64'\)",statement).group(1)
        self.assertEqual(json.loads(base64.b64decode(encoded)),value)
        self.assertNotIn('DELETE FROM public.items',statement)
        self.assertNotIn('auth.uid()',statement)

    def test_new_object_is_verified_and_url_is_minted_by_oci(self):
        status,result=self.call(plan([{'kind':'new','imageUrl':URL}]))
        self.assertEqual(status,200); self.assertTrue(result['ok'])
        self.assertEqual(self.storage.calls[0],('head','item-images/'+KEY))
        self.assertEqual(self.storage.calls[1][0],'par')
        encoded=re.search(r"decode\('([^']+)','base64'\)",self.writes.calls[-1][1]).group(1)
        sent=json.loads(base64.b64decode(encoded))
        self.assertEqual(sent['orderedRows'][0],{'kind':'new','imageUrl':'https://objectstorage.example.test/p/verified#teswa-object=item_image:'+KEY})
        self.assertNotIn('untrusted.example.test',self.writes.calls[-1][1])
        self.assertFalse(any(call[0]=='delete' for call in self.storage.calls))

    def test_rejects_invalid_plans_before_storage_or_writes(self):
        new={'kind':'new','imageUrl':URL}
        existing={'kind':'existing','imageId':IMAGE,'imageUrl':'https://legacy.example.test/old.jpg'}
        invalid=[plan([]),plan([new]*9),plan(ownerId=OTHER),plan(itemId=OTHER),
                 plan([existing,existing]),plan([new,new]),plan([{'kind':'new','imageUrl':'http://bad.test/#teswa-object=item_image:'+KEY}]),
                 plan([{'kind':'new','imageUrl':'https://bad.test/#teswa-object=item_image:'+OTHER+'/x.jpg'}]),
                 plan([{'kind':'new','imageUrl':'https://bad.test/x.jpg'}]),
                 plan([{'kind':'existing','imageId':'bad','imageUrl':'x'}]),
                 plan([{'kind':'new','imageUrl':URL,'ownerId':UID}]),dict(plan(),force=True)]
        for body in invalid:
            with self.subTest(body=body),self.assertRaises(ApiError): self.call(body)
        self.assertEqual(self.reads.calls,[])
        self.assertEqual(self.writes.calls,[])
        self.assertEqual(self.storage.calls,[])

    def test_owner_and_status_are_checked_before_public_grants(self):
        self.reads.result=None
        self.assertEqual(self.call(plan([{'kind':'new','imageUrl':URL}]))[1]['code'],'not_found_or_unauthorized')
        self.reads.result={'status':'reserved'}
        self.assertEqual(self.call(plan([{'kind':'new','imageUrl':URL}]))[1]['code'],'not_editable')
        self.assertEqual(self.storage.calls,[]); self.assertEqual(self.writes.calls,[])

    def test_missing_or_invalid_media_never_changes_metadata(self):
        self.storage.found=None
        with self.assertRaises(ApiError) as error: self.call(plan([{'kind':'new','imageUrl':URL}]))
        self.assertEqual(error.exception.status,404)
        self.storage.found={'sizeBytes':12,'contentType':'text/plain'}
        with self.assertRaises(ApiError) as error: self.call(plan([{'kind':'new','imageUrl':URL}]))
        self.assertEqual(error.exception.status,409)
        self.assertEqual(self.writes.calls,[])

    def test_rejections_and_malformed_results_fail_closed(self):
        for code in ('invalid_input','not_found_or_unauthorized','not_editable'):
            self.writes.result={'code':code}
            self.assertEqual(self.call()[1],{'ok':False,'code':code})
        for result in ({'code':'unexpected'}, {'code':'updated'}, {'code':'updated','removedImageUrls':[123]},None):
            self.writes.result=result
            with self.subTest(result=result),self.assertRaises(ApiError) as error: self.call()
            self.assertEqual(error.exception.status,503)

    def test_method_path_and_auth_rejections(self):
        with self.assertRaises(ApiError) as error: self.call(method='GET')
        self.assertEqual(error.exception.status,405)
        with self.assertRaises(ApiError) as error: self.call(authorization='Bearer bad')
        self.assertEqual(error.exception.status,401)
        with self.assertRaises(ApiError): self.api.handle('POST','/v1/marketplace/items/'+ITEM+'/edit/images/plan?force=true','Bearer valid',plan())
        self.assertEqual(self.writes.calls,[])


class RoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        image_plan=MarketplaceImagePlanApi(Auth(),DB({'status':'active'}),DB({'code':'updated','removedImageUrls':[]}),Storage())
        cls.server=Server(('127.0.0.1',0),marketplace_edit=MarketplaceEditApi(Auth(),DB(None),DB(None),image_plan))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True); cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(2)
    def test_domain_route_and_exact_gateway_allowlist(self):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        conn.request('POST','/v1/marketplace/items/'+ITEM+'/edit/images/plan',json.dumps(plan()),{'Authorization':'Bearer valid','Content-Type':'application/json'})
        response=conn.getresponse(); self.assertEqual(response.status,200); self.assertTrue(json.loads(response.read())['ok']); conn.close()
        spec=importlib.util.spec_from_file_location('gateway',Path(__file__).with_name('auth-api-shadow-gateway.py'))
        gateway=importlib.util.module_from_spec(spec); spec.loader.exec_module(gateway)
        path='/v1/marketplace/items/'+ITEM+'/edit/images/plan'
        self.assertTrue(any(rule.fullmatch(path) for rule in gateway.DOMAIN_MUTATION_PATTERNS))
        self.assertFalse(any(rule.fullmatch(path+'?force=true') for rule in gateway.DOMAIN_MUTATION_PATTERNS))
        self.assertFalse(any(rule.fullmatch(path) for rule in gateway.DOMAIN_GET))


if __name__=='__main__': unittest.main()
