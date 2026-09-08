import type { MarketplaceCoreContract, PublishBaseFailure } from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceWriteAdapter = Pick<MarketplaceCoreContract,
  'createPublishedListingBase'|'setLiked'|'markPublishFailed'|'attachPublishedVideo'|
  'addPublishedWantedTags'|'deletePublishedImageMetadata'>;

export function createOracleMarketplaceWriteAdapter(transport: OracleHttpTransport): OracleMarketplaceWriteAdapter {
  return {
    async createPublishedListingBase(input) {
      const result=await transport.request<{itemId:string}>({method:'POST',path:'/v1/marketplace/items',body:input});
      if (result.ok && result.data.itemId===input.itemId) return {ok:true,data:undefined};
      const reason: PublishBaseFailure = result.ok ? 'unknown'
        : result.reason==='conflict' ? 'item_insert_failed' : 'unknown';
      return {ok:false,reason,message:'Oracle listing publish failed.'};
    },
    async setLiked(itemId,userId,liked) {
      const result=await transport.request<{liked:boolean}>({method:'POST',path:'/v1/marketplace/likes',body:{itemId,userId,liked}});
      return result.ok&&result.data.liked===liked?{ok:true,data:{liked}}:{ok:false,reason:'unknown',message:'Oracle item like update failed.'};
    },
    async markPublishFailed(itemId,ownerId) {
      return voidWrite(transport,`/v1/marketplace/items/${itemId}/publish-failed`,{ownerId});
    },
    async attachPublishedVideo(input) {
      const result=await voidWrite(transport,`/v1/marketplace/items/${input.itemId}/video`,input);
      return result.ok?result:{...result,reason:'video_insert_failed' as const};
    },
    async addPublishedWantedTags(itemId,tags) {
      return voidWrite(transport,`/v1/marketplace/items/${itemId}/wanted-tags`,{tags});
    },
    async deletePublishedImageMetadata(itemId) {
      return voidWrite(transport,`/v1/marketplace/items/${itemId}/images/delete`,{});
    },
  };
}

async function voidWrite(transport:OracleHttpTransport,path:string,body:unknown) {
  const result=await transport.request<{ok:boolean}>({method:'POST',path,body});
  return result.ok&&result.data.ok?{ok:true as const,data:undefined}:{ok:false as const,reason:'unknown' as const,message:'Oracle marketplace write failed.'};
}
