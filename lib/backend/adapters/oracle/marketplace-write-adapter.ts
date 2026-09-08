import type {
  MarketplaceCoreContract, PublishBaseFailure, ListingLifecycleCode,
  EditableListingRecord, EditableListingImagesContextRecord,
  ListingCoreUpdateFailure,
} from '@/lib/backend/contracts/marketplace';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleMarketplaceWriteAdapter = Pick<MarketplaceCoreContract,
  'createPublishedListingBase'|'setLiked'|'markPublishFailed'|'attachPublishedVideo'|
  'addPublishedWantedTags'|'deletePublishedImageMetadata'|'archiveOwned'|'reactivateOwned'|
  'deleteOwnedArchived'|'getImageUrls'|'getEditableListing'|'updateListingCore'|
  'getEditableListingImagesContext'>;

const LIFECYCLE_FAILURES = new Set<string>([
  'not_found_or_unauthorized', 'not_active', 'not_archived', 'has_open_offers', 'has_deal_history',
]);
const EDIT_FAILURES = new Set<ListingCoreUpdateFailure>(['not_found_or_unauthorized','not_editable']);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
function validEditable(value: unknown, id: string): value is EditableListingRecord {
  if (!record(value) || value.id !== id || !['active','archived'].includes(String(value.status))
    || typeof value.title !== 'string' || typeof value.condition !== 'string'
    || !['specific','flexible','surprise'].includes(String(value.desireMode))
    || !Array.isArray(value.wantedTags) || !value.wantedTags.every((tag:unknown)=>typeof tag==='string')) return false;
  return ['categoryId','city','area','conditionNotes','description','itemStory','swapReason','goodFor','desireText']
    .every(key=>nullableString(value[key]));
}
function validEditImages(value: unknown, id: string): value is EditableListingImagesContextRecord {
  if (!record(value) || value.itemId !== id || typeof value.title !== 'string'
    || !['active','archived'].includes(String(value.status)) || !Array.isArray(value.images)) return false;
  return value.images.every((image:unknown)=>record(image) && typeof image.id==='string'
    && typeof image.imageUrl==='string' && typeof image.isPrimary==='boolean'
    && (image.sortOrder===null || Number.isInteger(image.sortOrder)) && nullableString(image.createdAt));
}

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
    async archiveOwned(itemId) {
      return lifecycleWrite(transport,itemId,'archive','archived');
    },
    async reactivateOwned(itemId) {
      return lifecycleWrite(transport,itemId,'reactivate','reactivated');
    },
    async deleteOwnedArchived(itemId) {
      return lifecycleWrite(transport,itemId,'delete-archived','deleted');
    },
    async getImageUrls(itemId) {
      const result=await transport.request<{items:unknown}>({method:'GET',path:`/v1/marketplace/items/${itemId}/images/urls`});
      if (!result.ok) throw new Error('Oracle listing image read failed.');
      if (!Array.isArray(result.data.items) || !result.data.items.every((url:unknown)=>typeof url==='string')) {
        throw new Error('Invalid Oracle listing image response.');
      }
      return result.data.items as string[];
    },
    async getEditableListing(itemId,_ownerId) {
      const id=itemId.trim();
      if (!id) return null;
      const result=await transport.request<unknown>({path:`/v1/marketplace/items/${id}/edit`});
      if (!result.ok) {
        if (result.reason==='not_found') return null;
        throw new Error('Oracle listing editor read failed.');
      }
      if (!validEditable(result.data,id)) throw new Error('Invalid Oracle listing editor response.');
      return result.data;
    },
    async getEditableListingImagesContext(itemId,_ownerId) {
      const id=itemId.trim();
      if (!id) return null;
      const result=await transport.request<unknown>({path:`/v1/marketplace/items/${id}/edit/images`});
      if (!result.ok) {
        if (result.reason==='not_found') return null;
        throw new Error('Oracle listing image editor read failed.');
      }
      if (!validEditImages(result.data,id)) throw new Error('Invalid Oracle listing image editor response.');
      return result.data;
    },
    async updateListingCore(input) {
      const result=await transport.request<{ok:unknown;code:unknown}>({method:'POST',path:`/v1/marketplace/items/${input.itemId}/edit`,body:input});
      if (!result.ok) return {ok:false,reason:'unknown',message:'Oracle listing update failed.'};
      if (result.data.ok===true && result.data.code==='updated') return {ok:true,data:undefined};
      const code=result.data.code;
      if (result.data.ok===false && typeof code==='string' && EDIT_FAILURES.has(code as ListingCoreUpdateFailure)) {
        return {ok:false,reason:code as ListingCoreUpdateFailure,message:'Listing cannot be edited.'};
      }
      return {ok:false,reason:'unknown',message:'Invalid Oracle listing update response.'};
    },
  };
}

async function lifecycleWrite(
  transport:OracleHttpTransport,itemId:string,action:string,success:ListingLifecycleCode,
):Promise<ListingLifecycleCode> {
  const result=await transport.request<{code:unknown}>({method:'POST',path:`/v1/marketplace/items/${itemId}/${action}`,body:{}});
  if (!result.ok) throw new Error('Oracle listing lifecycle failed.');
  const code=result.data.code;
  if (code!==success && (typeof code!=='string' || !LIFECYCLE_FAILURES.has(code))) {
    throw new Error('Invalid Oracle listing lifecycle response.');
  }
  return code as ListingLifecycleCode;
}

async function voidWrite(transport:OracleHttpTransport,path:string,body:unknown) {
  const result=await transport.request<{ok:boolean}>({method:'POST',path,body});
  return result.ok&&result.data.ok?{ok:true as const,data:undefined}:{ok:false as const,reason:'unknown' as const,message:'Oracle marketplace write failed.'};
}
