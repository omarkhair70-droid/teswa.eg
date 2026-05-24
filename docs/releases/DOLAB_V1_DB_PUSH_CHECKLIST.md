# Dolab v1 — DB Push Checklist

This checklist prepares Dolab v1 backend objects for Preview validation.

## 1) Local baseline (run first)

```bash
git checkout main
git pull origin main
npm.cmd run typecheck
npx.cmd expo-doctor
```

## 2) DB preflight review (before push)
Inspect pending migrations and confirm they include all required Dolab scope:

- `public.dolab_items`
- `public.dolab_media`
- `public.dolab_notes`
- RLS policies
- `dolab-media` storage bucket
- `storage.objects` policies
- `updated_at` triggers

## 3) Push command (manual placeholder)

```bash
supabase db push
```

> **Important:** Do **not** run this inside Codex.
> Run manually only after local `typecheck` and `expo-doctor` pass and after migration review is complete.

## 4) Post-push manual Supabase verification
After push, validate in Supabase dashboard/SQL:

- [ ] Tables exist (`dolab_items`, `dolab_media`, `dolab_notes`)
- [ ] RLS is enabled on Dolab tables
- [ ] Bucket `dolab-media` exists and is **private**
- [ ] Storage policies exist for expected Dolab paths/actions
- [ ] Authenticated user can insert their own `dolab_items`
- [ ] Authenticated user cannot read another user’s rows
- [ ] Storage path ownership works: `{user_id}/{dolab_item_id_or_inbox}/{filename}`
