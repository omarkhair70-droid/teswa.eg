# Google Play account deletion — M44A

## What this phase implements
- In-app **Account Deletion** entry in Profile with explicit user confirmation.
- Authenticated mobile helper that calls Supabase Edge Function `delete-account`.
- Backend deletion core to remove Teswa-owned data/media, then delete the Supabase Auth user.

## Required deployment
Deploy this Edge Function before release testing:

```bash
supabase functions deploy delete-account
```

Required environment variables in Supabase Edge Functions runtime:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## End-to-end validation checklist
1. Sign in with a test user that has profile media, listings, story media, and conversations.
2. Open **Profile** → **حذف الحساب نهائيًا** → **حذف الحساب** and confirm.
3. Verify mobile session is cleared and user exits authenticated flow.
4. Verify in Supabase:
   - Auth user is deleted.
   - User-owned rows/media are removed from covered tables/buckets.

## Important compliance note
This phase does **not** add the public web deletion-request URL yet. That public page is still required before Google Play submission and is planned for the later legal/public-web phase.
