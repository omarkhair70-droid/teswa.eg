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
  ItemVideoMetadataRecord,
  ItemVideoDiscoveryRecord,
  MovingItemRecord,
  PulseItemTeaserMetadataRecord,
  ItemStoryDiscoveryRecord,
} from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceReadAdapter = Pick<MarketplaceReadContract,
  'listFeed' | 'listNearbyFeed' | 'getFeedItem' | 'getDetail' | 'listActiveByOwner'> & {
  getLikeSummaries(itemIds:string[],viewerId?:string|null):Promise<Map<string,ItemLikeSummary>>;
  listMine(userId:string):Promise<MyListingRecord[]>;
  listActiveCategories():Promise<ActiveMarketplaceCategory[]>;
  getExchangeItemSummaries(itemIds:string[]):Promise<ExchangeItemSummaryRecord[]>;
  getItemVideoMetadata(itemId:string):Promise<ItemVideoMetadataRecord|null>;
  getItemVideoPresence(itemIds:string[]):Promise<Map<string,boolean>>;
  listRecentItemVideoDiscovery(limit:number):Promise<ItemVideoDiscoveryRecord[]>;
  listMovingItems(limit:number):Promise<MovingItemRecord[]>;
  listPulseItemTeasers(limit:number):Promise<PulseItemTeaserMetadataRecord[]>;
  countMarketplaceItemsSince(sinceIso:string):Promise<number>;
  listItemStoryDiscovery(limit:number):Promise<ItemStoryDiscoveryRecord[]>;
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
    async listNearbyFeed(input): Promise<MarketplaceReadPage> {
      const result=await transport.request<MarketplaceReadPage>({path:'/v1/marketplace/nearby',query:{latitude:input.latitude,longitude:input.longitude,radiusKm:input.radiusKm??3,offset:input.offset??0,limit:input.limit??20}});
      if(!result.ok||!Array.isArray(result.data.items)||typeof result.data.hasMore!=='boolean')return configuredFailure();return result.data;
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
    async getItemVideoMetadata(itemId){const result=await transport.request<unknown>({path:`/v1/marketplace/items/${itemId}/video`});
      if(!result.ok||!result.data||typeof result.data!=='object')return configuredFailure();const value=(result.data as {item?:unknown}).item;
      if(value===null)return null;if(!value||typeof value!=='object'||typeof (value as ItemVideoMetadataRecord).id!=='string')return configuredFailure();return value as ItemVideoMetadataRecord;},
    async getItemVideoPresence(itemIds){const ids=[...new Set(itemIds.map(id=>id.trim()).filter(Boolean))];if(!ids.length)return new Map();const result=await transport.request<unknown>({path:'/v1/marketplace/video-presence',query:{ids:ids.join(',')}});
      if(!result.ok||!result.data||typeof result.data!=='object')return configuredFailure();const values=(result.data as {values?:unknown}).values;if(!values||typeof values!=='object'||Array.isArray(values)||Object.values(values).some(v=>v!==true))return configuredFailure();return new Map(Object.keys(values).map(id=>[id,true]));},
    async listRecentItemVideoDiscovery(limit){return readItems<ItemVideoDiscoveryRecord>(transport,'/v1/marketplace/video-discovery',limit);},
    async listMovingItems(limit){return readItems<MovingItemRecord>(transport,'/v1/marketplace/moving',limit);},
    async listPulseItemTeasers(limit){return readItems<PulseItemTeaserMetadataRecord>(transport,'/v1/marketplace/pulse-teasers',limit);},
    async countMarketplaceItemsSince(sinceIso){const result=await transport.request<{count:unknown}>({path:'/v1/marketplace/count-since',query:{since:sinceIso}});if(!result.ok||!Number.isSafeInteger(result.data.count)||Number(result.data.count)<0)return configuredFailure();return Number(result.data.count);},
    async listItemStoryDiscovery(limit){return readItems<ItemStoryDiscoveryRecord>(transport,'/v1/marketplace/story-discovery',limit);},
  };
}

async function readItems<T>(transport:OracleHttpTransport,path:string,limit:number):Promise<T[]> {
  const result=await transport.request<{items:unknown}>({path,query:{limit}});
  if(!result.ok||!Array.isArray(result.data.items))return configuredFailure();return result.data.items as T[];
}
