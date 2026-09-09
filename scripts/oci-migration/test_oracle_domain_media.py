import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('media', Path(__file__).with_name('oracle_media.py'))
media = importlib.util.module_from_spec(spec); spec.loader.exec_module(media)
UID = '11111111-1111-4111-8111-111111111111'


class Auth:
    def resolve(self, authorization):
        if authorization != 'Bearer valid': raise media.ApiError(401, 'invalid_session')
        return UID


class Storage:
    def __init__(self): self.objects = {}; self.pars = []; self.deleted = []
    def head(self, name): return self.objects.get(name)
    def par(self, name, access, seconds, label):
        self.pars.append((name, access, seconds, label)); return 'https://object.example/p/'+label
    def delete(self, name): self.deleted.append(name)


class MediaTests(unittest.TestCase):
    def body(self, key=None):
        return {'purpose':'item_image','objectKey':key or 'items/'+UID+'/item/file.jpg',
                'contentType':'image/jpeg','sizeBytes':123}

    def test_upload_grant_is_owner_scoped_and_write_only(self):
        store=Storage(); status, out=media.MediaApi(Auth(),store).handle(
            'POST','/v1/media/uploads','Bearer valid',self.body())
        self.assertEqual(status,201); self.assertEqual(out['expiresIn'],900)
        self.assertEqual(store.pars[0][1],'ObjectWrite')
        with self.assertRaises(media.ApiError) as error:
            media.MediaApi(Auth(),store).handle('POST','/v1/media/uploads','Bearer valid',self.body('items/other/file.jpg'))
        self.assertEqual(error.exception.status,403)

    def test_complete_checks_size_and_returns_public_object_par(self):
        store=Storage(); physical='item-images/items/'+UID+'/item/file.jpg'
        store.objects[physical]={'sizeBytes':123,'contentType':'image/jpeg'}
        status,out=media.MediaApi(Auth(),store).handle('POST','/v1/media/uploads/complete','Bearer valid',self.body())
        self.assertEqual(status,200); self.assertIn('#teswa-object=item_image:',out['publicUrl'])
        self.assertEqual(store.pars[0][1],'ObjectRead')
        bad=self.body(); bad['sizeBytes']=124
        with self.assertRaises(media.ApiError) as error:
            media.MediaApi(Auth(),store).handle('POST','/v1/media/uploads/complete','Bearer valid',bad)
        self.assertEqual(error.exception.code,'media_size_mismatch')

    def test_delete_rejects_cross_owner_before_mutation(self):
        store=Storage(); own=self.body(); own['sizeBytes']=None
        foreign=self.body('items/22222222-2222-4222-8222-222222222222/item/file.jpg'); foreign['sizeBytes']=None
        with self.assertRaises(media.ApiError) as error:
            media.MediaApi(Auth(),store).handle('DELETE','/v1/media/objects','Bearer valid',{'objects':[own,foreign]})
        self.assertEqual(error.exception.status,403); self.assertEqual(store.deleted,[])

    def test_unknown_fields_and_path_traversal_are_rejected(self):
        for body in ({**self.body(),'ownerId':UID}, self.body('../'+UID+'/file.jpg')):
            with self.subTest(body=body), self.assertRaises(media.ApiError) as error:
                media.MediaApi(Auth(),Storage()).handle('POST','/v1/media/uploads','Bearer valid',body)
            self.assertEqual(error.exception.status,400)

    def test_deal_voice_read_allows_only_rls_authorized_participant(self):
        key='deals/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222/voice.m4a'
        physical='deal-voice-messages/'+key; store=Storage(); store.objects[physical]={'sizeBytes':12,'contentType':'audio/m4a'}
        class Allowed:
            def __init__(self,value): self.value=value
            def can_read(self,user_id,object_key): return self.value and user_id==UID and object_key==key
        body={'purpose':'deal_voice','objectKey':key,'contentType':None,'sizeBytes':None,'expiresInSeconds':60}
        status,out=media.MediaApi(Auth(),store,Allowed(True)).handle('POST','/v1/media/signed-url','Bearer valid',dict(body))
        self.assertEqual(status,200); self.assertIn('signedUrl',out)
        with self.assertRaises(media.ApiError) as error:
            media.MediaApi(Auth(),store,Allowed(False)).handle('POST','/v1/media/signed-url','Bearer valid',dict(body))
        self.assertEqual(error.exception.status,403)


if __name__ == '__main__': unittest.main()
