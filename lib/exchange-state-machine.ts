export const OFFER_STATUSES = [
  'pending',
  'thinking',
  'accepted',
  'soft_rejected',
  'redirected',
  'withdrawn',
  'expired',
  'cancelled_after_accept',
] as const;

export const DEAL_STATUSES = [
  'coordinating',
  'completed_pending_confirmation',
  'completed',
  'cancelled',
  'disputed',
] as const;

export type CanonicalOfferStatus = (typeof OFFER_STATUSES)[number];
export type CanonicalDealStatus = (typeof DEAL_STATUSES)[number];

const OFFER_ALLOWED_TRANSITIONS: Record<CanonicalOfferStatus, ReadonlySet<CanonicalOfferStatus>> = {
  pending: new Set(['thinking', 'accepted', 'soft_rejected', 'redirected', 'withdrawn', 'expired']),
  thinking: new Set(['accepted', 'soft_rejected', 'redirected', 'withdrawn', 'expired']),
  accepted: new Set(['cancelled_after_accept']),
  soft_rejected: new Set([]),
  redirected: new Set([]),
  withdrawn: new Set([]),
  expired: new Set([]),
  cancelled_after_accept: new Set([]),
};

const DEAL_ALLOWED_TRANSITIONS: Record<CanonicalDealStatus, ReadonlySet<CanonicalDealStatus>> = {
  coordinating: new Set(['completed_pending_confirmation', 'completed', 'cancelled', 'disputed']),
  completed_pending_confirmation: new Set(['completed', 'cancelled', 'disputed']),
  completed: new Set([]),
  cancelled: new Set([]),
  disputed: new Set([]),
};

export function isTerminalOfferStatus(status: string) {
  return ['soft_rejected', 'redirected', 'withdrawn', 'expired', 'cancelled_after_accept'].includes(status);
}

export function isTerminalDealStatus(status: string) {
  return ['completed', 'cancelled', 'disputed'].includes(status);
}

export function canTransitionOfferStatus(from: string, to: string) {
  if (from === to) return true;
  if (!OFFER_STATUSES.includes(from as CanonicalOfferStatus) || !OFFER_STATUSES.includes(to as CanonicalOfferStatus)) return false;
  return OFFER_ALLOWED_TRANSITIONS[from as CanonicalOfferStatus].has(to as CanonicalOfferStatus);
}

export function canTransitionDealStatus(from: string, to: string) {
  if (from === to) return true;
  if (!DEAL_STATUSES.includes(from as CanonicalDealStatus) || !DEAL_STATUSES.includes(to as CanonicalDealStatus)) return false;
  return DEAL_ALLOWED_TRANSITIONS[from as CanonicalDealStatus].has(to as CanonicalDealStatus);
}
