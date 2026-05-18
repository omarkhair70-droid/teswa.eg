import { supabase } from '@/lib/supabase/client';

const ITEM_IMAGES_BUCKET = 'item-images';
const ITEM_IMAGES_PUBLIC_MARKER = '/storage/v1/object/public/item-images/';

type ArchiveRpcResult = 'archived' | 'not_found_or_unauthorized' | 'not_active' | 'has_open_offers';
type ReactivateRpcResult = 'reactivated' | 'not_found_or_unauthorized' | 'not_archived';
type DeleteRpcResult = 'deleted' | 'not_found_or_unauthorized' | 'not_archived' | 'has_open_offers' | 'has_deal_history';

export type ListingLifecycleResult =
  | {
      ok: true;
      storageCleanupFailed?: true;
      message: string;
    }
  | {
      ok: false;
      reason:
        | 'not_found_or_unauthorized'
        | 'not_active'
        | 'not_archived'
        | 'has_open_offers'
        | 'has_deal_history'
        | 'unknown';
      message: string;
    };

function deriveStoragePathFromPublicUrl(url: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const markerIndex = trimmed.indexOf(ITEM_IMAGES_PUBLIC_MARKER);
  if (markerIndex < 0) return null;
  const afterMarker = trimmed.slice(markerIndex + ITEM_IMAGES_PUBLIC_MARKER.length).split('?')[0];
  if (!afterMarker) return null;
  try {
    return decodeURIComponent(afterMarker);
  } catch {
    return afterMarker;
  }
}

export async function archiveListingFromMobile(input: { itemId: string }): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) return { ok: false, reason: 'unknown', message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.' };

  const { data, error } = await supabase.rpc('archive_owned_listing_if_safe', { p_item_id: itemId });
  if (error) return { ok: false, reason: 'unknown', message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.' };

  const result = data as ArchiveRpcResult | null;
  switch (result) {
    case 'archived':
      return { ok: true, message: 'تمت أرشفة العنصر. لم يعد ظاهرًا في السوق.' };
    case 'not_found_or_unauthorized':
      return { ok: false, reason: 'not_found_or_unauthorized', message: 'العنصر غير موجود أو لا تملك صلاحية إدارته.' };
    case 'not_active':
      return { ok: false, reason: 'not_active', message: 'يمكن أرشفة العناصر النشطة فقط.' };
    case 'has_open_offers':
      return { ok: false, reason: 'has_open_offers', message: 'لا يمكن أرشفة العنصر قبل حسم العروض المفتوحة المرتبطة به.' };
    default:
      return { ok: false, reason: 'unknown', message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.' };
  }
}

export async function reactivateListingFromMobile(input: { itemId: string }): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) return { ok: false, reason: 'unknown', message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.' };

  const { data, error } = await supabase.rpc('reactivate_owned_archived_listing', { p_item_id: itemId });
  if (error) return { ok: false, reason: 'unknown', message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.' };

  const result = data as ReactivateRpcResult | null;
  switch (result) {
    case 'reactivated':
      return { ok: true, message: 'عاد العنصر نشطًا وسيظهر في السوق من جديد.' };
    case 'not_found_or_unauthorized':
      return { ok: false, reason: 'not_found_or_unauthorized', message: 'العنصر غير موجود أو لا تملك صلاحية إدارته.' };
    case 'not_archived':
      return { ok: false, reason: 'not_archived', message: 'يمكن إعادة تفعيل العناصر المؤرشفة فقط.' };
    default:
      return { ok: false, reason: 'unknown', message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.' };
  }
}

export async function deleteArchivedListingFromMobile(input: { itemId: string }): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) return { ok: false, reason: 'unknown', message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.' };

  let imagePrefetchFailed = false;
  let imageUrls: string[] = [];

  const imagesQuery = await supabase.from('item_images').select('image_url').eq('item_id', itemId);
  if (imagesQuery.error) {
    imagePrefetchFailed = true;
  } else {
    imageUrls = ((imagesQuery.data ?? []) as { image_url: string | null }[]).map((row) => row.image_url?.trim() || '').filter(Boolean);
  }

  const { data, error } = await supabase.rpc('delete_owned_archived_listing_if_safe', { p_item_id: itemId });
  if (error) return { ok: false, reason: 'unknown', message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.' };

  const result = data as DeleteRpcResult | null;
  switch (result) {
    case 'not_found_or_unauthorized':
      return { ok: false, reason: 'not_found_or_unauthorized', message: 'العنصر غير موجود أو لا تملك صلاحية حذفه.' };
    case 'not_archived':
      return { ok: false, reason: 'not_archived', message: 'يمكن حذف العناصر المؤرشفة فقط.' };
    case 'has_open_offers':
      return { ok: false, reason: 'has_open_offers', message: 'لا يمكن حذف العنصر قبل حسم العروض المفتوحة المرتبطة به.' };
    case 'has_deal_history':
      return { ok: false, reason: 'has_deal_history', message: 'لا يمكن حذف عنصر مرتبط بتاريخ صفقات. يمكنك إبقاؤه مؤرشفًا.' };
    case 'deleted': {
      const paths = imageUrls.map(deriveStoragePathFromPublicUrl).filter((value): value is string => Boolean(value));
      if (imagePrefetchFailed) {
        return {
          ok: true,
          storageCleanupFailed: true,
          message: 'تم حذف العنصر، لكن تعذر تنظيف بعض ملفات الصور القديمة من التخزين.',
        };
      }

      if (!paths.length) return { ok: true, message: 'تم حذف العنصر نهائيًا.' };

      const cleanupResult = await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(paths);
      if (cleanupResult.error) {
        return {
          ok: true,
          storageCleanupFailed: true,
          message: 'تم حذف العنصر، لكن تعذر تنظيف بعض ملفات الصور القديمة من التخزين.',
        };
      }

      return { ok: true, message: 'تم حذف العنصر نهائيًا.' };
    }
    default:
      return { ok: false, reason: 'unknown', message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.' };
  }
}
