import { teswaBackendRuntime } from '@/lib/backend/runtime';

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

export async function archiveListingFromMobile(input: {
  itemId: string;
}): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.',
    };
  }

  let result;
  try {
    result = await teswaBackendRuntime.marketplace.archiveOwned(itemId);
  } catch {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.',
    };
  }

  switch (result) {
    case 'archived':
      return { ok: true, message: 'تمت أرشفة العنصر. لم يعد ظاهرًا في السوق.' };
    case 'not_found_or_unauthorized':
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'العنصر غير موجود أو لا تملك صلاحية إدارته.',
      };
    case 'not_active':
      return {
        ok: false,
        reason: 'not_active',
        message: 'يمكن أرشفة العناصر النشطة فقط.',
      };
    case 'has_open_offers':
      return {
        ok: false,
        reason: 'has_open_offers',
        message: 'لا يمكن أرشفة العنصر قبل حسم العروض المفتوحة المرتبطة به.',
      };
    default:
      return {
        ok: false,
        reason: 'unknown',
        message: 'تعذر أرشفة العنصر حالياً. حاول مرة أخرى.',
      };
  }
}

export async function reactivateListingFromMobile(input: {
  itemId: string;
}): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.',
    };
  }

  let result;
  try {
    result = await teswaBackendRuntime.marketplace.reactivateOwned(itemId);
  } catch {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.',
    };
  }

  switch (result) {
    case 'reactivated':
      return { ok: true, message: 'عاد العنصر نشطًا وسيظهر في السوق من جديد.' };
    case 'not_found_or_unauthorized':
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'العنصر غير موجود أو لا تملك صلاحية إدارته.',
      };
    case 'not_archived':
      return {
        ok: false,
        reason: 'not_archived',
        message: 'يمكن إعادة تفعيل العناصر المؤرشفة فقط.',
      };
    default:
      return {
        ok: false,
        reason: 'unknown',
        message: 'تعذر إعادة تفعيل العنصر حالياً. حاول مرة أخرى.',
      };
  }
}

export async function deleteArchivedListingFromMobile(input: {
  itemId: string;
}): Promise<ListingLifecycleResult> {
  const itemId = input.itemId?.trim();
  if (!itemId) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.',
    };
  }

  let imagePrefetchFailed = false;
  let imageUrls: string[] = [];
  try {
    imageUrls = await teswaBackendRuntime.marketplace.getImageUrls(itemId);
  } catch {
    imagePrefetchFailed = true;
  }

  let result;
  try {
    result = await teswaBackendRuntime.marketplace.deleteOwnedArchived(itemId);
  } catch {
    return {
      ok: false,
      reason: 'unknown',
      message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.',
    };
  }

  switch (result) {
    case 'not_found_or_unauthorized':
      return {
        ok: false,
        reason: 'not_found_or_unauthorized',
        message: 'العنصر غير موجود أو لا تملك صلاحية حذفه.',
      };
    case 'not_archived':
      return {
        ok: false,
        reason: 'not_archived',
        message: 'يمكن حذف العناصر المؤرشفة فقط.',
      };
    case 'has_open_offers':
      return {
        ok: false,
        reason: 'has_open_offers',
        message: 'لا يمكن حذف العنصر قبل حسم العروض المفتوحة المرتبطة به.',
      };
    case 'has_deal_history':
      return {
        ok: false,
        reason: 'has_deal_history',
        message: 'لا يمكن حذف عنصر مرتبط بتاريخ صفقات. يمكنك إبقاؤه مؤرشفًا.',
      };
    case 'deleted': {
      const paths = imageUrls
        .map((url) =>
          teswaBackendRuntime.media.getObjectKeyFromPublicUrl('item_image', url),
        )
        .filter((value): value is string => Boolean(value));

      if (imagePrefetchFailed) {
        return {
          ok: true,
          storageCleanupFailed: true,
          message: 'تم حذف العنصر، لكن تعذر تنظيف بعض ملفات الصور القديمة من التخزين.',
        };
      }

      if (!paths.length) return { ok: true, message: 'تم حذف العنصر نهائيًا.' };

      const cleanupResult = await teswaBackendRuntime.media.remove(
        paths.map((objectKey) => ({
          purpose: 'item_image' as const,
          objectKey,
          contentType: null,
          sizeBytes: null,
        })),
      );
      if (!cleanupResult.ok) {
        return {
          ok: true,
          storageCleanupFailed: true,
          message: 'تم حذف العنصر، لكن تعذر تنظيف بعض ملفات الصور القديمة من التخزين.',
        };
      }

      return { ok: true, message: 'تم حذف العنصر نهائيًا.' };
    }
    default:
      return {
        ok: false,
        reason: 'unknown',
        message: 'تعذر حذف العنصر حالياً. حاول مرة أخرى.',
      };
  }
}
