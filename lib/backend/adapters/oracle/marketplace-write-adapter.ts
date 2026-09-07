import type { MarketplaceCoreContract, PublishBaseFailure } from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceWriteAdapter = Pick<MarketplaceCoreContract, 'createPublishedListingBase'>;

export function createOracleMarketplaceWriteAdapter(transport: OracleHttpTransport): OracleMarketplaceWriteAdapter {
  return {
    async createPublishedListingBase(input) {
      const result=await transport.request<{itemId:string}>({method:'POST',path:'/v1/marketplace/items',body:input});
      if (result.ok && result.data.itemId===input.itemId) return {ok:true,data:undefined};
      const reason: PublishBaseFailure = result.ok ? 'unknown'
        : result.reason==='conflict' ? 'item_insert_failed' : 'unknown';
      return {ok:false,reason,message:'Oracle listing publish failed.'};
    },
  };
}
