import type {
  MarketplaceFeedRecord,
  MarketplaceDetailRecord,
  MarketplaceOwnerListingRecord,
  MarketplaceReadContract,
  MarketplaceReadPage,
} from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceReadAdapter = Pick<
  MarketplaceReadContract,
  'listFeed' | 'getFeedItem' | 'getDetail' | 'listActiveByOwner'
>;

function configuredFailure(): never {
  throw new Error('Oracle marketplace request failed.');
}

export function createOracleMarketplaceReadAdapter(
  transport: OracleHttpTransport,
): OracleMarketplaceReadAdapter {
  return {
    async listFeed(input = {}): Promise<MarketplaceReadPage> {
      const result = await transport.request<MarketplaceReadPage>({
        path: '/v1/marketplace/feed',
        query: {
          offset: input.offset,
          limit: input.limit,
          query: input.filters?.query,
          category: input.filters?.category,
          condition: input.filters?.condition,
          city: input.filters?.city,
        },
      });
      if (!result.ok || !Array.isArray(result.data.items) || typeof result.data.hasMore !== 'boolean') {
        return configuredFailure();
      }
      return result.data;
    },

    async getFeedItem(itemId: string): Promise<MarketplaceFeedRecord | null> {
      const normalized = itemId.trim();
      if (!normalized) return null;
      const result = await transport.request<MarketplaceFeedRecord>({
        path: `/v1/marketplace/items/${normalized}`,
      });
      if (!result.ok) {
        if (result.reason === 'not_found') return null;
        return configuredFailure();
      }
      if (!result.data || result.data.id !== normalized) return configuredFailure();
      return result.data;
    },

    async getDetail(itemId: string): Promise<MarketplaceDetailRecord | null> {
      const normalized = itemId.trim();
      if (!normalized) return null;
      const result = await transport.request<MarketplaceDetailRecord>({
        path: `/v1/marketplace/items/${normalized}/detail`,
      });
      if (!result.ok) {
        if (result.reason === 'not_found') return null;
        return configuredFailure();
      }
      if (!result.data || result.data.id !== normalized || !Array.isArray(result.data.images)
        || !Array.isArray(result.data.wantedTags)) return configuredFailure();
      return result.data;
    },

    async listActiveByOwner(profileId: string, limit = 6): Promise<MarketplaceOwnerListingRecord[]> {
      const normalized = profileId.trim();
      if (!normalized) return [];
      const result = await transport.request<{ items: MarketplaceOwnerListingRecord[] }>({
        path: `/v1/marketplace/owners/${normalized}/active`,
        query: { limit },
      });
      if (!result.ok || !Array.isArray(result.data.items)) return configuredFailure();
      return result.data.items;
    },
  };
}
