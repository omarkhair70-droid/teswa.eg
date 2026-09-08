import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('domain', Path(__file__).with_name('oracle_domain_read.py'))
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)
UID = '11111111-1111-4111-8111-111111111111'
IID = '22222222-2222-4222-8222-222222222222'

class Auth:
    def resolve(self, token):
        if token != 'Bearer valid':
            raise domain.ApiError(401, 'invalid_session')
        return UID

class DB:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []
    def query(self, user, sql):
        self.calls.append((user, sql))
        return self.rows

class DomainReadTests(unittest.TestCase):
    def test_feed_uses_database_response_and_normalizes(self):
        row = {'id': IID, 'title':'كتاب', 'description':None, 'cover_image_url':None, 'category':'كتب', 'item_condition':'good_used', 'city':'بني سويف', 'owner_display_name':'Test', 'created_at':'2026-09-07T00:00:00Z'}
        db = DB({'items':[row,row], 'hasMore':True})
        status, body = domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/feed?limit=1','Bearer valid')
        self.assertEqual(status,200)
        self.assertIsNone(body['items'][0]['coverImageUrl'])
        self.assertEqual(len(body['items']),1)
        self.assertTrue(body['hasMore'])
        self.assertEqual(db.calls[0][0],UID)
    def test_unauthenticated_never_queries_database(self):
        db = DB(None)
        with self.assertRaises(domain.ApiError) as error:
            domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/feed',None)
        self.assertEqual(error.exception.status,401)
        self.assertEqual(db.calls,[])
    def test_detail_missing_is_404(self):
        with self.assertRaises(domain.ApiError) as error:
            domain.MarketplaceReadApi(Auth(),DB(None)).handle('GET','/v1/marketplace/items/'+IID,'Bearer valid')
        self.assertEqual(error.exception.status,404)
    def test_full_detail_uses_rls_query_and_returns_contract(self):
        detail = {'id':IID,'images':[],'wantedTags':[],'ownerPresence':None}
        db = DB(detail)
        status, body = domain.MarketplaceReadApi(Auth(),db).handle(
            'GET','/v1/marketplace/items/'+IID+'/detail','Bearer valid')
        self.assertEqual((status,body),(200,detail))
        self.assertIn("i.status='active'",db.calls[0][1])
        self.assertIn('item_wanted_tags',db.calls[0][1])
    def test_owner_active_list_is_bounded(self):
        db = DB([])
        status, body = domain.MarketplaceReadApi(Auth(),db).handle(
            'GET','/v1/marketplace/owners/'+UID+'/active?limit=24','Bearer valid')
        self.assertEqual((status,body),(200,{'items':[]}))
        self.assertIn('LIMIT 24',db.calls[0][1])
    def test_categories_mine_likes_and_exchange_use_rls_queries(self):
        api = domain.MarketplaceReadApi(Auth(), DB([]))
        for target,needle in (
            ('/v1/marketplace/categories','public.categories'),
            ('/v1/marketplace/mine','openIncomingOffersCount'),
            ('/v1/marketplace/likes?ids='+IID,'public.item_likes'),
            ('/v1/marketplace/exchange-items?ids='+IID,'ownerDisplayName'),
        ):
            db=DB([]); status,body=domain.MarketplaceReadApi(Auth(),db).handle('GET',target,'Bearer valid')
            self.assertEqual((status,body),(200,{'items':[]})); self.assertIn(needle,db.calls[0][1])
    def test_remaining_marketplace_reads_are_bounded(self):
        row={'id':IID,'title':'كتاب','description':None,'cover_image_url':None,'category':None,'item_condition':None,'city':None,'owner_display_name':None,'created_at':'2026-09-08T00:00:00Z'}
        db=DB([row,row]);status,body=domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/nearby?latitude=30&longitude=31&radiusKm=3&limit=1&offset=0','Bearer valid')
        self.assertEqual(status,200);self.assertTrue(body['hasMore']);self.assertIn('get_nearby_marketplace_items',db.calls[0][1])
        for target,needle in (
            ('/v1/marketplace/video-discovery?limit=5','item_videos'),('/v1/marketplace/moving?limit=5','get_public_moving_items'),
            ('/v1/marketplace/pulse-teasers?limit=5','videoStoragePath'),('/v1/marketplace/story-discovery?limit=5','storySnippet'),
        ):
            db=DB([]);self.assertEqual(domain.MarketplaceReadApi(Auth(),db).handle('GET',target,'Bearer valid')[1],{'items':[]});self.assertIn(needle,db.calls[0][1])
    def test_video_presence_metadata_and_count(self):
        db=DB({IID:True});body=domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/video-presence?ids='+IID,'Bearer valid')[1];self.assertTrue(body['values'][IID])
        db=DB(None);body=domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/items/'+IID+'/video','Bearer valid')[1];self.assertIsNone(body['item'])
        db=DB(7);body=domain.MarketplaceReadApi(Auth(),db).handle('GET','/v1/marketplace/count-since?since=2026-09-08T00%3A00%3A00Z','Bearer valid')[1];self.assertEqual(body['count'],7)
    def test_batch_ids_are_uuid_validated_and_bounded(self):
        with self.assertRaises(domain.ApiError):
            domain.MarketplaceReadApi(Auth(),DB([])).handle('GET','/v1/marketplace/likes?ids=bad','Bearer valid')
    def test_query_is_encoded_not_interpolated(self):
        value="x'); DROP TABLE public.items; --"
        sql = domain.feed_sql(20,0,{'query':value})
        self.assertNotIn('DROP TABLE',sql)
        self.assertIn('decode(',sql)
    def test_invalid_pagination_and_query_rejected(self):
        api = domain.MarketplaceReadApi(Auth(),DB(None))
        for target in ['/v1/marketplace/feed?limit=999', '/v1/marketplace/feed?offset=-1', '/v1/marketplace/feed?limit=1&limit=2', '/v1/marketplace/feed?admin=true']:
            with self.subTest(target=target), self.assertRaises(domain.ApiError) as error:
                api.handle('GET',target,'Bearer valid')
            self.assertEqual(error.exception.status,400)
    def test_missing_db_configuration_fails_closed(self):
        with patch.dict(domain.os.environ, {}, clear=True):
            with self.assertRaises(domain.ApiError) as error:
                domain.PgReadRunner(database_url='',psql='psql').query(UID,'SELECT 1')
        self.assertEqual(error.exception.status,503)
    def test_database_uses_transaction_local_role_and_identity(self):
        class Result:
            returncode=0
            stdout='11111111-1111-4111-8111-111111111111\n{"ok":true}\n'
        with patch.dict(domain.os.environ, {'TESWA_DOMAIN_DATABASE_URL':'postgresql://localhost/test'}), patch.object(domain.subprocess,'run',return_value=Result()) as run:
            output=domain.PgReadRunner(psql='psql').query(UID,"SELECT json_build_object('ok',true)")
        self.assertEqual(output,{'ok':True})
        sql=run.call_args.kwargs['input']
        self.assertIn('BEGIN READ ONLY;',sql)
        self.assertIn('SET LOCAL ROLE teswa_app_authenticated;',sql)
        self.assertIn("set_config('teswa.user_id'",sql)
        self.assertIn(', true)',sql)
        self.assertEqual(run.call_args.kwargs['env']['PGOPTIONS'].count('row_security=on'),1)

if __name__ == '__main__': unittest.main()
