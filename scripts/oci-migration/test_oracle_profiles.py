import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('profiles',Path(__file__).with_name('oracle_profiles.py'))
profiles=importlib.util.module_from_spec(spec); spec.loader.exec_module(profiles)
UID='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'

class Auth:
    def resolve(self, value): return UID

class DB:
    def __init__(self, result): self.result=result; self.calls=[]
    def query(self, user, sql): self.calls.append((user,sql)); return self.result

class ProfileTests(unittest.TestCase):
    def test_reads_current_and_public_profile_under_rls_identity(self):
        row={'id':UID,'displayName':'Omar'}; reads=DB(row); api=profiles.ProfilesApi(Auth(),reads,DB({}))
        self.assertEqual(api.handle('GET','/v1/profiles/me','x')[1],row)
        self.assertEqual(api.handle('GET','/v1/profiles/'+OTHER,'x')[1],row)
        self.assertTrue(all(call[0]==UID for call in reads.calls))

    def test_setup_binds_actor_and_encodes_text(self):
        writes=DB({'ok':True}); api=profiles.ProfilesApi(Auth(),DB({}),writes)
        body={'userId':UID,'displayName':"x'); DROP TABLE profiles;--",'username':'omar_70'}
        self.assertEqual(api.handle('POST','/v1/profiles/setup','x',body),(200,{'ok':True}))
        self.assertNotIn('DROP TABLE',writes.calls[0][1]); self.assertIn("decode('",writes.calls[0][1])
        with self.assertRaises(profiles.ApiError) as error:
            api.handle('POST','/v1/profiles/setup','x',{**body,'userId':OTHER})
        self.assertEqual(error.exception.status,403)

    def test_profile_image_requires_owned_oracle_object(self):
        api=profiles.ProfilesApi(Auth(),DB({}),DB({'updated':True}))
        valid='https://object.example/p#teswa-object=profile_image:profiles/'+UID+'/avatar.jpg'
        self.assertEqual(api.handle('POST','/v1/profiles/image','x',{'userId':UID,'kind':'avatar','imageUrl':valid})[0],200)
        for value in ('https://object.example/avatar.jpg','http://object.example/p#teswa-object=profile_image:profiles/'+UID+'/x'):
            with self.subTest(value=value),self.assertRaises(profiles.ApiError) as error:
                api.handle('POST','/v1/profiles/image','x',{'userId':UID,'kind':'avatar','imageUrl':value})
            self.assertEqual(error.exception.status,403)

    def test_update_returns_rls_row_and_privacy_is_validated(self):
        row={'id':UID,'displayName':'Omar'}; writes=DB(row); api=profiles.ProfilesApi(Auth(),DB({}),writes)
        body={'userId':UID,'displayName':'Omar','username':'omar_70','profileTagline':None,'bio':None,'city':'Cairo','area':None}
        self.assertEqual(api.handle('POST','/v1/profiles/update','x',body)[1],row)
        with self.assertRaises(profiles.ApiError):
            api.handle('POST','/v1/profiles/privacy','x',{'userId':UID,'value':'public'})

if __name__=='__main__': unittest.main()
