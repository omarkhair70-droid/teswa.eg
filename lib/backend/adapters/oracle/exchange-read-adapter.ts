import type {
  DealConversationTransportRecord,
  DealLifecycleContract,
  DealLifecycleMessageRecord,
  DealLifecycleRecord,
  OfferLifecycleContract,
  OfferLifecycleRecord,
} from '@/lib/backend/contracts/offers-deals';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

export type OracleOfferReadAdapter = Pick<OfferLifecycleContract,
  'listIncoming' | 'listSent' | 'getOffer' | 'getLatestDealId' | 'getLatestDealIds'>;
export type OracleDealReadAdapter = Pick<DealLifecycleContract,
  'getDeal' | 'listMessages' | 'getUnreadCount' | 'listConversationInbox' |
  'listConfirmationUserIds' | 'hasReview' | 'countMessagesSince'>;

type Page<T> = { items: T[]; hasMore: boolean };
type OfferRow = OfferLifecycleRecord & { dealId: string | null };
const MAX_ROWS = 10000;

function failure(): never {
  throw new Error('Oracle exchange request failed.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

async function readOne<T extends { id: string }>(
  transport: OracleHttpTransport, path: string, id: string,
): Promise<T | null> {
  const result = await transport.request<T>({ path });
  if (!result.ok) {
    if (result.reason === 'not_found') return null;
    return failure();
  }
  if (!isRecord(result.data) || result.data.id !== id) return failure();
  return result.data;
}

async function readPage<T>(
  transport: OracleHttpTransport, path: string,
  query: Record<string, string | number>,
): Promise<Page<T>> {
  const result = await transport.request<Page<T>>({ path, query });
  if (!result.ok || !isRecord(result.data) || !Array.isArray(result.data.items)
      || typeof result.data.hasMore !== 'boolean') return failure();
  return result.data;
}

// The lifecycle interfaces return arrays, not pages. Drain the bounded HTTP
// pages instead of silently dropping records after the first 50/100.
async function collect<T>(
  transport: OracleHttpTransport, path: string,
  query: Record<string, string | number>, pageSize: number, maximum = MAX_ROWS,
): Promise<T[]> {
  if (!Number.isInteger(maximum) || maximum < 0 || maximum > MAX_ROWS) return failure();
  const items: T[] = [];
  while (items.length < maximum) {
    const limit = Math.min(pageSize, maximum - items.length);
    const page = await readPage<T>(transport, path, { ...query, limit, offset: items.length });
    if (page.items.length > limit || (page.hasMore && page.items.length === 0)) return failure();
    items.push(...page.items);
    if (!page.hasMore) return items;
    if (items.length >= MAX_ROWS && maximum === MAX_ROWS) return failure();
  }
  return items;
}

async function readCount(transport: OracleHttpTransport, path: string,
  query?: Record<string, string | number>): Promise<number> {
  const result = await transport.request<{ count: number }>({ path, query });
  if (!result.ok || !isRecord(result.data) || !validCount(result.data.count)) return failure();
  return result.data.count;
}

function offerPath(offerId: string): string {
  return `/v1/offers/${offerId}`;
}

export function createOracleOfferReadAdapter(transport: OracleHttpTransport): OracleOfferReadAdapter {
  const getRow = (offerId: string) => readOne<OfferRow>(transport, offerPath(offerId), offerId);
  return {
    async listIncoming(_userId) {
      const rows = await collect<OfferRow>(transport, '/v1/offers', { direction: 'incoming' }, 50);
      return rows.filter(row => row.status === 'pending' || row.status === 'thinking');
    },
    async listSent(_userId) {
      return collect<OfferRow>(transport, '/v1/offers', { direction: 'sent' }, 50);
    },
    async getOffer(offerId) {
      return getRow(offerId);
    },
    async getLatestDealId(offerId) {
      const row = await getRow(offerId);
      return row?.dealId ?? null;
    },
    async getLatestDealIds(offerIds) {
      const found = new Map<string, string>();
      const unique = [...new Set(offerIds)];
      for (let offset = 0; offset < unique.length; offset += 20) {
        const batch = await Promise.all(unique.slice(offset, offset + 20).map(async id => ({
          id, dealId: await getRow(id).then(row => row?.dealId ?? null),
        })));
        for (const row of batch) if (row.dealId) found.set(row.id, row.dealId);
      }
      return found;
    },
  };
}

export function createOracleDealReadAdapter(transport: OracleHttpTransport): OracleDealReadAdapter {
  return {
    async getDeal(dealId) {
      return readOne<DealLifecycleRecord>(transport, `/v1/deals/${dealId}`, dealId);
    },
    async getUnreadCount() {
      return readCount(transport, '/v1/deals/unread-count');
    },
    async listConversationInbox(userId) {
      const rows = await collect<DealConversationTransportRecord>(
        transport, '/v1/deals/inbox', { userId }, 50,
      );
      if (rows.some(row => !isRecord(row) || typeof row.dealId !== 'string'
          || !isRecord(row.otherParticipant) || typeof row.otherParticipant.id !== 'string'
          || !validCount(row.unreadCount) || typeof row.lastActivityAt !== 'string')) return failure();
      return rows;
    },
    async listConfirmationUserIds(dealId) {
      const result = await transport.request<{ userIds: string[] }>({ path: `/v1/deals/${dealId}/confirmations` });
      if (!result.ok || !isRecord(result.data) || !Array.isArray(result.data.userIds)
          || result.data.userIds.some(id => typeof id !== 'string')) return failure();
      return result.data.userIds;
    },
    async listMessages(dealId, limit = 100) {
      if (!Number.isInteger(limit) || limit < 0 || limit > MAX_ROWS) return failure();
      if (limit === 0) return [];
      const rows = await collect<DealLifecycleMessageRecord>(
        transport, `/v1/deals/${dealId}/messages`, { order: 'asc' }, 100, limit,
      );
      if (rows.some(row => !isRecord(row) || row.dealId !== dealId)) return failure();
      return rows;
    },
    async hasReview(dealId, reviewerId) {
      const result = await transport.request<{ hasReview: boolean }>({
        path: `/v1/deals/${dealId}/reviews`, query: { reviewerId },
      });
      if (!result.ok || !isRecord(result.data) || typeof result.data.hasReview !== 'boolean') {
        return { ok: false, reason: 'unknown', message: 'Oracle review lookup failed.' };
      }
      return { ok: true, data: result.data.hasReview };
    },
    async countMessagesSince(dealId, senderId, since) {
      return readCount(transport, `/v1/deals/${dealId}/messages/count`, { senderId, since });
    },
  };
}
