import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { fetchExchangeItemSummariesByIds } from '@/lib/exchange-item-summaries';

export type DealConversation = {
  dealId: string;
  status: string;
  requestedItemTitle: string;
  offeredItemTitle: string;
  otherParticipant: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  latestMessage: {
    body: string;
    createdAt: string;
    senderId: string;
    messageType: 'text' | 'voice';
  } | null;
  unreadCount: number;
  lastActivityAt: string;
};

export async function fetchDealConversationsForUser(
  userId: string,
): Promise<DealConversation[]> {
  const rows = await teswaBackendRuntime.deals.listConversationInbox(userId);
  if (!rows.length) return [];

  const itemIds = [
    ...new Set(
      rows.flatMap((row) => [row.requestedItemId, row.offeredItemId]),
    ),
  ];
  const summaries = await fetchExchangeItemSummariesByIds(itemIds);
  const itemById = new Map(summaries.map((summary) => [summary.id, summary]));

  return rows.map((row) => ({
    dealId: row.dealId,
    status: row.status,
    requestedItemTitle:
      itemById.get(row.requestedItemId)?.title ?? 'عنصر مطلوب غير متاح',
    offeredItemTitle:
      itemById.get(row.offeredItemId)?.title ?? 'عنصر معروض غير متاح',
    otherParticipant: row.otherParticipant,
    latestMessage: row.latestMessage,
    unreadCount: row.unreadCount,
    lastActivityAt: row.lastActivityAt,
  }));
}
