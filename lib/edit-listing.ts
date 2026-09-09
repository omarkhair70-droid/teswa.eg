import { DesireMode, ItemCondition } from '@/lib/publish-item';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

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

export async function fetchEditableListingById(
  itemId: string,
  ownerId: string,
): Promise<EditableListing | null> {
  const listing = await teswaBackendRuntime.marketplace.getEditableListing(itemId, ownerId);
  if (!listing) return null;

  return {
    id: listing.id,
    status: listing.status,
    title: listing.title,
    categoryId: listing.categoryId,
    city: listing.city,
    area: listing.area,
    condition: listing.condition as ItemCondition,
    conditionNotes: listing.conditionNotes,
    description: listing.description,
    itemStory: listing.itemStory,
    swapReason: listing.swapReason,
    goodFor: listing.goodFor,
    desireMode: listing.desireMode as DesireMode,
    desireText: listing.desireText,
    wantedTags: listing.wantedTags,
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

  if (!title) {
    return { ok: false, reason: 'invalid_input', message: 'عنوان العنصر مطلوب.' };
  }
  if ((itemStory?.length ?? 0) > 600) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'قصة العنصر يجب ألا تتجاوز 600 حرف.',
    };
  }
  if ((swapReason?.length ?? 0) > 240) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'سبب المبادلة يجب ألا يتجاوز 240 حرف.',
    };
  }
  if ((goodFor?.length ?? 0) > 240) {
    return {
      ok: false,
      reason: 'invalid_input',
      message: 'مفيد لمن يجب ألا يتجاوز 240 حرف.',
    };
  }

  const result = await teswaBackendRuntime.marketplace.updateListingCore({
    itemId,
    ownerId,
    title,
    categoryId: payload.categoryId,
    city: normalizeNullableText(payload.city),
    area: normalizeNullableText(payload.area),
    condition: payload.condition,
    conditionNotes: normalizeNullableText(payload.conditionNotes),
    description: normalizeNullableText(payload.description),
    itemStory,
    swapReason,
    goodFor,
    desireMode: payload.desireMode,
    desireText: normalizeNullableText(payload.desireText),
    wantedTags: normalizeTags(payload.wantedTags),
  });

  if (result.ok) return { ok: true };

  switch (result.reason) {
    case 'not_found_or_unauthorized':
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'العنصر غير موجود أو لا تملك صلاحية تعديله.',
      };
    case 'not_editable':
      return {
        ok: false,
        reason: 'not_editable',
        message: 'لا يمكن تعديل هذا العنصر في حالته الحالية.',
      };
    case 'item_update_failed':
      return {
        ok: false,
        reason: 'item_update_failed',
        message: 'تعذر حفظ بيانات العنصر. حاول مرة أخرى.',
      };
    case 'tags_update_failed':
      return {
        ok: false,
        reason: 'tags_update_failed',
        message: 'تم حفظ بيانات العنصر الأساسية، لكن تعذر تحديث الوسوم المطلوبة بالكامل. يمكنك إعادة المحاولة.',
      };
    default:
      return {
        ok: false,
        reason: 'unknown',
        message: 'تعذر التحقق من صلاحية التعديل حالياً.',
      };
  }
}
