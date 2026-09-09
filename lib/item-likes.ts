import { teswaBackendRuntime } from '@/lib/backend/runtime';

export async function fetchItemLikesSummaryForViewer(input: {
  itemIds: string[];
  viewerId?: string | null;
}): Promise<Map<string, { likeCount: number; likedByMe: boolean }>> {
  const itemIds = Array.from(
    new Set(input.itemIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (!itemIds.length) return new Map();

  return teswaBackendRuntime.marketplace.getLikeSummaries(
    itemIds,
    input.viewerId ?? null,
  );
}

export async function setItemLiked(input: {
  itemId: string;
  userId: string;
  liked: boolean;
}): Promise<{ ok: true; liked: boolean } | { ok: false; message: string }> {
  const itemId = input.itemId.trim();
  const userId = input.userId.trim();
  if (!itemId) return { ok: false, message: 'تعذر تحديد العنصر.' };
  if (!userId) return { ok: false, message: 'يجب تسجيل الدخول أولاً.' };

  const result = await teswaBackendRuntime.marketplace.setLiked(
    itemId,
    userId,
    input.liked,
  );
  if (!result.ok) {
    return {
      ok: false,
      message: input.liked
        ? 'تعذر إضافة الإعجاب حالياً.'
        : 'تعذر إزالة الإعجاب حالياً.',
    };
  }
  return { ok: true, liked: result.data.liked };
}
