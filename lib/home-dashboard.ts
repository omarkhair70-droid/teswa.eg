import { fetchUnreadContextualMessagesCount } from '@/lib/contextual-conversations';
import { fetchDealConversationsForUser } from '@/lib/messages';
import { fetchMyListings } from '@/lib/my-listings';
import { fetchOffersInbox } from '@/lib/offers';

export type HomeDashboardSummary = {
  incomingActionableOffersCount: number;
  unreadDealMessagesCount: number;
  activeListingsCount: number;
  unreadContextualMessagesCount: number;
};

export async function fetchHomeDashboardSummary(userId: string): Promise<HomeDashboardSummary> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return {
      incomingActionableOffersCount: 0,
      unreadDealMessagesCount: 0,
      activeListingsCount: 0,
      unreadContextualMessagesCount: 0,
    };
  }

  const [offersInbox, conversations, myListings, unreadContextualMessagesCount] = await Promise.all([
    fetchOffersInbox(normalizedUserId),
    fetchDealConversationsForUser(normalizedUserId),
    fetchMyListings(normalizedUserId),
    fetchUnreadContextualMessagesCount(),
  ]);

  const incomingActionableOffersCount = offersInbox.incomingActionableOffers.length;
  const unreadDealMessagesCount = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const activeListingsCount = myListings.filter((listing) => listing.status === 'active').length;

  return {
    incomingActionableOffersCount,
    unreadDealMessagesCount,
    activeListingsCount,
    unreadContextualMessagesCount,
  };
}
