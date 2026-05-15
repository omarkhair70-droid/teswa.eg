import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';
import { supabase } from '@/lib/supabase/client';

export type DealConversation = {
  dealId: string;
  status: string;
  requestedItemTitle: string;
  offeredItemTitle: string;
  otherParticipant: { id: string; displayName: string | null; avatarUrl: string | null };
  latestMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  lastActivityAt: string;
};

export async function fetchDealConversationsForUser(userId: string): Promise<DealConversation[]> {
  const { data: deals, error } = await supabase
    .from('swap_deals')
    .select('id,status,created_at,requested_item_id,offered_item_id,requester_id,offerer_id')
    .or(`requester_id.eq.${userId},offerer_id.eq.${userId}`);
  if (error) throw error;

  const dealRows = deals ?? [];
  if (!dealRows.length) return [];

  const dealIds = dealRows.map((d) => d.id as string);
  const itemIds = [...new Set(dealRows.flatMap((d) => [d.requested_item_id as string, d.offered_item_id as string]))];
  const participantIds = [...new Set(dealRows.flatMap((d) => [d.requester_id as string, d.offerer_id as string]))];

  const [summaries, profilesRes, messagesRes, readsRes] = await Promise.all([
    fetchExchangeItemSummariesByIds(itemIds),
    supabase.from('profiles').select('id,display_name,avatar_url').in('id', participantIds),
    supabase.from('deal_messages').select('id,deal_id,sender_id,body,created_at').in('deal_id', dealIds).order('created_at', { ascending: false }),
    supabase.from('deal_message_reads').select('deal_id,last_read_at').eq('user_id', userId).in('deal_id', dealIds),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (readsRes.error) throw readsRes.error;

  const itemById = new Map(summaries.map((s) => [s.id, s]));
  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id as string, { id: p.id as string, displayName: (p.display_name as string | null) ?? null, avatarUrl: (p.avatar_url as string | null) ?? null }]));

  const messagesByDeal = new Map<string, any[]>();
  for (const message of messagesRes.data ?? []) {
    const dealId = message.deal_id as string;
    const list = messagesByDeal.get(dealId) ?? [];
    list.push(message);
    messagesByDeal.set(dealId, list);
  }

  const lastReadByDeal = new Map((readsRes.data ?? []).map((r) => [r.deal_id as string, (r.last_read_at as string | null) ?? null]));

  const conversations: DealConversation[] = dealRows.map((deal) => {
    const dealId = deal.id as string;
    const requesterId = deal.requester_id as string;
    const offererId = deal.offerer_id as string;
    const otherId = userId === requesterId ? offererId : requesterId;
    const otherParticipant = profileById.get(otherId) ?? { id: otherId, displayName: null, avatarUrl: null };

    const messages = messagesByDeal.get(dealId) ?? [];
    const latest = messages[0] ?? null;
    const lastRead = lastReadByDeal.get(dealId);
    const unreadCount = messages.filter((m) => (m.sender_id as string) !== userId && (!lastRead || new Date(m.created_at as string).getTime() > new Date(lastRead).getTime())).length;

    return {
      dealId,
      status: deal.status as string,
      requestedItemTitle: itemById.get(deal.requested_item_id as string)?.title ?? 'عنصر مطلوب غير متاح',
      offeredItemTitle: itemById.get(deal.offered_item_id as string)?.title ?? 'عنصر معروض غير متاح',
      otherParticipant,
      latestMessage: latest
        ? {
            body: latest.body as string,
            createdAt: latest.created_at as string,
            senderId: latest.sender_id as string,
          }
        : null,
      unreadCount,
      lastActivityAt: (latest?.created_at as string | undefined) ?? ((deal.created_at as string | null) ?? new Date(0).toISOString()),
    };
  });

  return conversations.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}
