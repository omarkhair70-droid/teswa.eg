import type {
  AnalyticsContract,
  AuthContract,
  MarketplaceContract,
  MediaStorageContract,
  MessagingContract,
  NotificationsContract,
  OffersDealsContract,
  ProfileContract,
} from '@/lib/backend/contracts';

export interface TeswaBackend {
  auth: AuthContract;
  profiles: ProfileContract;
  marketplace: MarketplaceContract;
  offersDeals: OffersDealsContract;
  messaging: MessagingContract;
  media: MediaStorageContract;
  notifications: NotificationsContract;
  analytics: AnalyticsContract;
}
