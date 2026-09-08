import type {
  MarketplaceFeedRecord,
  MarketplaceDetailRecord,
  MarketplaceOwnerListingRecord,
  MarketplaceReadContract,
  MarketplaceReadPage,
  ActiveMarketplaceCategory,
  ExchangeItemSummaryRecord,
  ItemLikeSummary,
  MyListingRecord,
} from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceReadAdapter = Pick<MarketplaceReadContract,
  'listFeed' | 'getFeedItem' | 'getDetail' | 'listActiveByOwner'> & {
  getLikeSummaries(itemIds:string[],viewerId?:string|null):Promise<Map<string,ItemLikeSummary>>;
  listMine(userId:string):Promise<MyListingRecord[]>;
  listActiveCategories():Promise<ActiveMarketplaceCategory[]>;
  getExchangeItemSummaries(itemIds:string[]):Promise<ExchangeItemSummaryRecord[]>;
};

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
    async getLikeSummaries(itemIds) {
      const ids=[...new Set(itemIds.map(id=>id.trim()).filter(Boolean))];
      if (!ids.length) return new Map();
      const result=await transport.request<{items:Array<{itemId:string;likeCount:number;likedByMe:boolean}>}>({path:'/v1/marketplace/likes',query:{ids:ids.join(',')}});
      if (!result.ok || !Array.isArray(result.data.items)) return configuredFailure();
      return new Map(result.data.items.map(row=>[row.itemId,{likeCount:row.likeCount,likedByMe:row.likedByMe}]));
    },
    async listMine(_userId) {
      const result=await transport.request<{items:MyListingRecord[]}>({path:'/v1/marketplace/mine'});
      if (!result.ok || !Array.isArray(result.data.items)) return configuredFailure();
      return result.data.items;
    },
    async listActiveCategories() {
      const result=await transport.request<{items:ActiveMarketplaceCategory[]}>({path:'/v1/marketplace/categories'});
      if (!result.ok || !Array.isArray(result.data.items)) return configuredFailure();
      return result.data.items;
    },
    async getExchangeItemSummaries(itemIds) {
      const ids=[...new Set(itemIds.map(id=>id.trim()).filter(Boolean))];
      if (!ids.length) return [];
      const result=await transport.request<{items:ExchangeItemSummaryRecord[]}>({path:'/v1/marketplace/exchange-items',query:{ids:ids.join(',')}});
      if (!result.ok || !Array.isArray(result.data.items)) return configuredFailure();
      return result.data.items;
    },
  };
}
