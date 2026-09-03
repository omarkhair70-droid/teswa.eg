import type {
  AnalyticsContract,
  AuthContract,
  DiscoveryContract,
  DolabContract,
  MarketplaceContract,
  MediaStorageContract,
  MessagingContract,
  NotificationsContract,
  OffersDealsContract,
  PolicyAcceptanceContract,
  ProfileContract,
  StoriesContract,
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
  stories: StoriesContract;
  discovery: DiscoveryContract;
  policies: PolicyAcceptanceContract;
  dolab: DolabContract;
}
