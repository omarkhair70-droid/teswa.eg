import { supabase } from '@/lib/supabase/client';

export async function fetchItemLikesSummaryForViewer(input: {
  itemIds: string[];
  viewerId?: string | null;
}): Promise<Map<string, { likeCount: number; likedByMe: boolean }>> {
  const itemIds = Array.from(new Set(input.itemIds.map((id) => id.trim()).filter(Boolean)));
  const result = new Map<string, { likeCount: number; likedByMe: boolean }>();
  if (!itemIds.length) return result;

  const { data, error } = await supabase.from('item_likes').select('item_id,user_id').in('item_id', itemIds);
  if (error) throw error;

  const viewerId = input.viewerId?.trim() || null;
  for (const row of (data ?? []) as Array<{ item_id: string | null; user_id: string | null }>) {
    const itemId = row.item_id?.trim();
    if (!itemId) continue;
    const current = result.get(itemId) ?? { likeCount: 0, likedByMe: false };
    current.likeCount += 1;
    if (viewerId && row.user_id?.trim() === viewerId) current.likedByMe = true;
    result.set(itemId, current);
  }

  return result;
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

  if (input.liked) {
    const { error } = await supabase.from('item_likes').insert({ item_id: itemId, user_id: userId });
    if (!error || error.code === '23505') return { ok: true, liked: true };
    return { ok: false, message: 'تعذر إضافة الإعجاب حالياً.' };
  }

  const { error } = await supabase.from('item_likes').delete().eq('item_id', itemId).eq('user_id', userId);
  if (!error) return { ok: true, liked: false };
  return { ok: false, message: 'تعذر إزالة الإعجاب حالياً.' };
}
