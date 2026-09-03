import type {
  AnalyticsContract,
  AuthContract,
  DiscoveryContract,
  DolabContract,
  MarketplaceContract,
  MediaStorageContract,
  MessagingContract,
  ModerationContract,
  NotificationsContract,
  OffersDealsContract,
  PolicyAcceptanceContract,
  ProfileContract,
  ReviewsContract,
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
  reviews: ReviewsContract;
  moderation: ModerationContract;
  dolab: DolabContract;
}
