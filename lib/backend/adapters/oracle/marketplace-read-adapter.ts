import type {
  MarketplaceFeedRecord,
  MarketplaceReadContract,
  MarketplaceReadPage,
} from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceReadAdapter = Pick<
  MarketplaceReadContract,
  'listFeed' | 'getFeedItem'
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
  };
}
