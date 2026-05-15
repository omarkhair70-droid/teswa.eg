import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { supabase } from '@/lib/supabase/client';

export const DEAL_STATUS_LABELS: Record<string, string> = {
  coordinating: 'قيد التنسيق',
  completed_pending_confirmation: 'بانتظار اكتمال التأكيد',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
  disputed: 'محل نزاع',
};

export function getDealStatusLabel(status: string) {
  return DEAL_STATUS_LABELS[status] ?? status;
}

export async function fetchDealEntryById(dealId: string, userId: string) {
  const { data, error } = await supabase
    .from('swap_deals')
    .select('id,status,accepted_at,requested_item_id,offered_item_id,requester_id,offerer_id')
    .eq('id', dealId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false as const, reason: 'not_found' as const };
  if (data.requester_id !== userId && data.offerer_id !== userId) return { ok: false as const, reason: 'unauthorized' as const };

  const [requestedItem, offeredItem] = await Promise.all([
    fetchExchangeItemSummariesByIds([data.requested_item_id as string]).then((r) => r[0] ?? null),
    fetchExchangeItemSummariesByIds([data.offered_item_id as string]).then((r) => r[0] ?? null),
  ]);

  return { ok: true as const, deal: { id: data.id as string, status: data.status as string, acceptedAt: (data.accepted_at as string | null) ?? null, requestedItem, offeredItem } };
}
