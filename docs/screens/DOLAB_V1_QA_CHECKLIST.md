# Dolab v1 — Manual QA Checklist

Use this checklist to validate Dolab v1 behavior end-to-end before Preview rollout.

## A) Navigation
- [ ] Home opens
- [ ] Hub drawer opens
- [ ] `دولابي` entry opens `/dolab`
- [ ] Back navigation works
- [ ] Logged-out Dolab does not crash

## B) Add media
- [ ] Add image
- [ ] Add video
- [ ] Tap `سجل صوت`
- [ ] Audio placeholder appears
- [ ] Remove media works
- [ ] Media badges show correct type/status

## C) Draft Studio
- [ ] Open `مسودة عنصر`
- [ ] Create draft with no media
- [ ] Create draft with linked media
- [ ] Edit draft
- [ ] Remove media and verify draft link cleanup

## D) Self Chat
- [ ] Create text note
- [ ] Create idea
- [ ] Create checklist
- [ ] Create `voice_placeholder` type
- [ ] Link message to draft
- [ ] Link message to media
- [ ] Delete message
- [ ] Remove media and verify self-message cleanup

## E) Share Bridge
- [ ] Tap `شارك لاحقًا`
- [ ] Edit share body
- [ ] Prepare share draft
- [ ] Prepared badge appears
- [ ] `جاهز للمشاركة` section updates
- [ ] `افتح الرسائل` routes safely
- [ ] No real direct message is sent

## F) Publish Bridge
- [ ] Tap `حوّل لعرض`
- [ ] Checklist shows missing/ready states
- [ ] Prepare incomplete draft
- [ ] Prepare ready draft
- [ ] `عروض جاهزة للسوق` section updates
- [ ] `افتح إضافة عنصر` routes safely
- [ ] No `public.items` insert happens

## G) Persistence **without** DB push
- [ ] App does not crash
- [ ] Local saves work
- [ ] Schema missing fallback appears calmly
- [ ] Cloud status shows `الحفظ السحابي غير مفعّل بعد` when relevant

## H) Persistence **after** DB push
- [ ] Save draft creates/updates `dolab_items`
- [ ] Save self-chat note creates `dolab_notes`
- [ ] Cloud status becomes `متزامن جزئيًا`
- [ ] Counts refresh after saves

## I) Upload **after** DB push
- [ ] Image upload creates storage object and `dolab_media` row
- [ ] Video upload creates storage object and `dolab_media` row
- [ ] Audio placeholder is skipped safely
- [ ] Failed upload can retry
- [ ] If row insert fails after upload, best-effort cleanup prevents orphan files

## J) Regression checks
- [ ] Home still opens
- [ ] Add Item still opens
- [ ] Messages still open
- [ ] Item detail routes still work
- [ ] No auth/startup regression
