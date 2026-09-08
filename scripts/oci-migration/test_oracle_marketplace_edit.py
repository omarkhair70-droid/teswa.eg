import base64
import http.client
import importlib.util
import json
import re
import threading
import unittest
from pathlib import Path

from oracle_domain_read import ApiError
from oracle_marketplace_edit import MarketplaceEditApi, normalize_edit
from oracle_domain_service import Server

UID='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
ITEM='33333333-3333-4333-8333-333333333333'


def payload(**changes):
    value=dict(itemId=ITEM,ownerId=UID,title='New title',categoryId=None,city='Cairo',area=None,
               condition='good_used',conditionNotes=None,description='Description',itemStory=None,
               swapReason=None,goodFor=None,desireMode='flexible',desireText=None,wantedTags=['book'])
    value.update(changes)
    return value


class Auth:
    def resolve(self, authorization):
        if authorization!='Bearer valid': raise ApiError(401,'invalid_session')
        return UID


class DB:
    def __init__(self,result): self.result=result; self.calls=[]
    def query(self,user_id,statement):
        self.calls.append((user_id,statement))
        return self.result


class EditTests(unittest.TestCase):
    def setUp(self):
        self.reads=DB(None); self.writes=DB({'code':'updated'})
        self.api=MarketplaceEditApi(Auth(),self.reads,self.writes)

    def call(self,method='POST',action='edit',body=None,authorization='Bearer valid'):
        return self.api.handle(method,'/v1/marketplace/items/'+ITEM+'/'+action,authorization,body)

    def test_normalization_preserves_contract_and_deduplicates_tags(self):
        value=normalize_edit(payload(title='  Book  ',wantedTags=[' book ','book','art']),ITEM,UID)
        self.assertEqual(value['title'],'Book')
        self.assertEqual(value['wantedTags'],['book','art'])
        self.assertEqual(value['ownerId'],UID)

    def test_rejects_actor_spoofing_and_invalid_inputs_before_database(self):
        invalid=[payload(ownerId=OTHER),payload(itemId=OTHER),payload(condition='invalid'),
                 payload(desireMode='invalid'),payload(wantedTags=['x'*51]),
                 payload(wantedTags=['x']*13),payload(title=' '),payload(description='x'*4001),
                 payload(categoryId='bad'),payload(wantedTags=[1]),dict(payload(),unexpected=True)]
        for body in invalid:
            with self.subTest(body=body),self.assertRaises(ApiError): self.call(body=body)
        self.assertEqual(self.writes.calls,[])

    def test_authenticated_write_uses_one_atomic_function_and_encoded_payload(self):
        status,result=self.call(body=payload(title="O'Brien; --"))
        self.assertEqual((status,result),(200,{'ok':True,'code':'updated'}))
        actor,sql=self.writes.calls[-1]
        self.assertEqual(actor,UID)
        self.assertIn('teswa_runtime.update_owned_listing_core(',sql)
        self.assertNotIn('DELETE FROM public.items',sql)
        self.assertNotIn('auth.uid()',sql)
        encoded=re.search(r"decode\('([^']+)','base64'\)",sql).group(1)
        self.assertEqual(json.loads(base64.b64decode(encoded))['title'],"O'Brien; --")
        self.assertNotIn("O'Brien",sql)

    def test_business_rejections_and_invalid_response(self):
        for code in ('not_found_or_unauthorized','not_editable'):
            self.writes.result={'code':code}
            self.assertEqual(self.call(body=payload())[1],{'ok':False,'code':code})
        self.writes.result={'code':'unexpected'}
        with self.assertRaises(ApiError) as error: self.call(body=payload())
        self.assertEqual(error.exception.status,503)

    def test_owned_metadata_and_image_reads(self):
        self.reads.result={'id':ITEM,'wantedTags':[]}
        self.assertEqual(self.call('GET')[1],self.reads.result)
        self.assertIn("i.owner_id='"+UID+"'::uuid",self.reads.calls[-1][1])
        self.assertIn('archived',self.reads.calls[-1][1])
        self.reads.result={'itemId':ITEM,'images':[]}
        self.assertEqual(self.call('GET','edit/images')[1],self.reads.result)
        self.assertIn('ORDER BY m.is_primary DESC',self.reads.calls[-1][1])
        self.reads.result=None
        with self.assertRaises(ApiError) as error: self.call('GET')
        self.assertEqual(error.exception.status,404)

    def test_invalid_methods_paths_and_auth(self):
        for method,action,body in [('POST','edit/images',{}),('DELETE','edit',{}),('GET','edit',{})]:
            with self.subTest(method=method),self.assertRaises(ApiError): self.call(method,action,body)
        with self.assertRaises(ApiError) as error: self.call(body=payload(),authorization='Bearer bad')
        self.assertEqual(error.exception.status,401)
        with self.assertRaises(ApiError): self.api.handle('GET','/v1/marketplace/items/'+ITEM+'/edit?x=1','Bearer valid')
        self.assertEqual(self.writes.calls,[])


class RoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.edit=MarketplaceEditApi(Auth(),DB(None),DB({'code':'updated'}))
        cls.server=Server(('127.0.0.1',0),marketplace_edit=cls.edit)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True); cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(2)
    def request(self,method,action,body=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        headers={'Authorization':'Bearer valid'}
        if method=='POST':
            headers['Content-Type']='application/json'; body=json.dumps({} if body is None else body)
        try:
            conn.request(method,'/v1/marketplace/items/'+ITEM+'/'+action,body,headers)
            response=conn.getresponse(); return response.status,json.loads(response.read())
        finally: conn.close()
    def test_editor_reaches_its_own_handler(self):
        self.assertEqual(self.request('POST','edit',payload()),(200,{'ok':True,'code':'updated'}))
        self.assertEqual(self.request('GET','edit')[0],404)
        self.assertEqual(self.request('POST','edit/images',{})[0],405)
        self.assertEqual(self.request('POST','edit',payload(ownerId=OTHER))[0],403)

    def test_gateway_allowlist_is_narrow(self):
        spec=importlib.util.spec_from_file_location('gateway',Path(__file__).with_name('auth-api-shadow-gateway.py'))
        gateway=importlib.util.module_from_spec(spec); spec.loader.exec_module(gateway)
        base='/v1/marketplace/items/'+ITEM
        self.assertTrue(any(rule.fullmatch(base+'/edit') for rule in gateway.DOMAIN_GET))
        self.assertTrue(any(rule.fullmatch(base+'/edit/images') for rule in gateway.DOMAIN_GET))
        self.assertTrue(any(rule.fullmatch(base+'/edit') for rule in gateway.DOMAIN_MUTATION_PATTERNS))
        self.assertFalse(any(rule.fullmatch(base+'/edit/delete') for rule in gateway.DOMAIN_MUTATION_PATTERNS))
        self.assertFalse(any(rule.fullmatch(base+'/edit?force=true') for rule in gateway.DOMAIN_GET))


if __name__=='__main__': unittest.main()
