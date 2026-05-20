import { DesireMode, ItemCondition } from '@/lib/publish-item';
import { supabase } from '@/lib/supabase/client';

export type EditableListing = {
  id: string;
  status: 'active' | 'archived';
  title: string;
  categoryId: string | null;
  city: string | null;
  area: string | null;
  condition: ItemCondition;
  conditionNotes: string | null;
  description: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: DesireMode;
  desireText: string | null;
  wantedTags: string[];
};

export type UpdateListingCorePayload = {
  title: string;
  categoryId: string | null;
  city: string | null;
  area: string | null;
  condition: ItemCondition;
  conditionNotes: string | null;
  description: string | null;
  itemStory: string | null;
  swapReason: string | null;
  goodFor: string | null;
  desireMode: DesireMode;
  desireText: string | null;
  wantedTags: string[];
};

export type UpdateListingCoreResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not_found_or_unauthorized'
        | 'not_editable'
        | 'invalid_input'
        | 'item_update_failed'
        | 'tags_update_failed'
        | 'unknown';
      message: string;
    };

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeTags = (tags: string[]): string[] => tags.map((tag) => tag.trim()).filter(Boolean);

export async function fetchEditableListingById(itemId: string, ownerId: string): Promise<EditableListing | null> {
  const { data: item, error } = await supabase
    .from('items')
    .select('id,status,title,category_id,city,area,condition,condition_notes,description,item_story,swap_reason,good_for,desire_mode,desire_text')
    .eq('id', itemId)
    .eq('owner_id', ownerId)
    .in('status', ['active', 'archived'])
    .maybeSingle();

  if (error) throw error;
  if (!item) return null;

  const { data: tags, error: tagsError } = await supabase.from('item_wanted_tags').select('tag').eq('item_id', itemId);
  if (tagsError) throw tagsError;

  const wantedTags = (tags ?? [])
    .map((entry) => entry.tag?.trim())
    .filter((tag): tag is string => Boolean(tag));

  return {
    id: item.id,
    status: item.status,
    title: item.title?.trim() || 'عنصر بدون عنوان',
    categoryId: item.category_id,
    city: normalizeNullableText(item.city),
    area: normalizeNullableText(item.area),
    condition: item.condition,
    conditionNotes: normalizeNullableText(item.condition_notes),
    description: normalizeNullableText(item.description),
    itemStory: normalizeNullableText(item.item_story),
    swapReason: normalizeNullableText(item.swap_reason),
    goodFor: normalizeNullableText(item.good_for),
    desireMode: item.desire_mode,
    desireText: normalizeNullableText(item.desire_text),
    wantedTags,
  };
}

export async function updateListingCoreFields(input: {
  itemId: string;
  ownerId: string;
  payload: UpdateListingCorePayload;
}): Promise<UpdateListingCoreResult> {
  const { itemId, ownerId, payload } = input;

  if (!itemId || !ownerId) {
    return { ok: false, reason: 'invalid_input', message: 'بيانات العنصر غير مكتملة.' };
  }

  const title = payload.title.trim();
  const itemStory = normalizeNullableText(payload.itemStory);
  const swapReason = normalizeNullableText(payload.swapReason);
  const goodFor = normalizeNullableText(payload.goodFor);

  if (!title) return { ok: false, reason: 'invalid_input', message: 'عنوان العنصر مطلوب.' };
  if ((itemStory?.length ?? 0) > 600) return { ok: false, reason: 'invalid_input', message: 'قصة العنصر يجب ألا تتجاوز 600 حرف.' };
  if ((swapReason?.length ?? 0) > 240) return { ok: false, reason: 'invalid_input', message: 'سبب المبادلة يجب ألا يتجاوز 240 حرف.' };
  if ((goodFor?.length ?? 0) > 240) return { ok: false, reason: 'invalid_input', message: 'مفيد لمن يجب ألا يتجاوز 240 حرف.' };

  const { data: item, error: itemLookupError } = await supabase
    .from('items')
    .select('id,status,city,area')
    .eq('id', itemId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (itemLookupError) return { ok: false, reason: 'unknown', message: 'تعذر التحقق من صلاحية التعديل حالياً.' };
  if (!item) return { ok: false, reason: 'not_found_or_unauthorized', message: 'العنصر غير موجود أو لا تملك صلاحية تعديله.' };
  if (item.status !== 'active' && item.status !== 'archived') {
    return { ok: false, reason: 'not_editable', message: 'لا يمكن تعديل هذا العنصر في حالته الحالية.' };
  }

  const normalizedCity = normalizeNullableText(payload.city);
  const normalizedArea = normalizeNullableText(payload.area);
  const currentCity = normalizeNullableText(item.city);
  const currentArea = normalizeNullableText(item.area);
  const hasManualLocationTextChange = normalizedCity !== currentCity || normalizedArea !== currentArea;

  const { error: updateError } = await supabase
    .from('items')
    .update({
      title,
      category_id: payload.categoryId,
      city: normalizedCity,
      area: normalizedArea,
      condition: payload.condition,
      condition_notes: normalizeNullableText(payload.conditionNotes),
      description: normalizeNullableText(payload.description),
      item_story: itemStory,
      swap_reason: swapReason,
      good_for: goodFor,
      desire_mode: payload.desireMode,
      desire_text: normalizeNullableText(payload.desireText),
      ...(hasManualLocationTextChange ? { location_latitude: null, location_longitude: null } : {}),
    })
    .eq('id', itemId)
    .eq('owner_id', ownerId);

  if (updateError) return { ok: false, reason: 'item_update_failed', message: 'تعذر حفظ بيانات العنصر. حاول مرة أخرى.' };

  const normalizedTags = normalizeTags(payload.wantedTags);

  const { error: deleteTagsError } = await supabase.from('item_wanted_tags').delete().eq('item_id', itemId);
  if (deleteTagsError) {
    return { ok: false, reason: 'tags_update_failed', message: 'تم حفظ بيانات العنصر الأساسية، لكن تعذر تحديث الوسوم المطلوبة بالكامل. يمكنك إعادة المحاولة.' };
  }

  if (normalizedTags.length) {
    const { error: insertTagsError } = await supabase
      .from('item_wanted_tags')
      .insert(normalizedTags.map((tag) => ({ item_id: itemId, tag })));

    if (insertTagsError) {
      return { ok: false, reason: 'tags_update_failed', message: 'تم حفظ بيانات العنصر الأساسية، لكن تعذر تحديث الوسوم المطلوبة بالكامل. يمكنك إعادة المحاولة.' };
    }
  }

  return { ok: true };
}
