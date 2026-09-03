import type {
  OfferLifecycleContract,
  OfferLifecycleRecord,
  OfferStatus,
} from '@/lib/backend/contracts/offers-deals';
import { supabase } from '@/lib/supabase/client';

function mapOffer(row: any): OfferLifecycleRecord {
  return {
    id: row.id as string,
    status: row.status as OfferStatus,
    message: (row.message as string | null) ?? null,
    requestedItemId: row.requested_item_id as string,
    offeredItemId: row.offered_item_id as string,
    senderId: row.sender_id as string,
    receiverId: row.receiver_id as string,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

const OFFER_SELECT =
  'id,status,message,requested_item_id,offered_item_id,sender_id,receiver_id,created_at';

export function createSupabaseOfferLifecycleAdapter(): OfferLifecycleContract {
  return {
    async getItemForValidation(itemId) {
      const { data, error } = await supabase
        .from('items')
        .select('id,title,owner_id,status')
        .eq('id', itemId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        title: (data.title as string | null) ?? null,
        ownerId: data.owner_id as string,
        status: data.status as string,
      };
    },

    async listIncoming(userId) {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('receiver_id', userId)
        .in('status', ['pending', 'thinking'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapOffer);
    },

    async listSent(userId) {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('sender_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapOffer);
    },

    async getOffer(offerId) {
      const { data, error } = await supabase
        .from('offers')
        .select(OFFER_SELECT)
        .eq('id', offerId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapOffer(data) : null;
    },

    async getLatestDealId(offerId) {
      const { data, error } = await supabase
        .from('swap_deals')
        .select('id')
        .eq('offer_id', offerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },

    async getLatestDealIds(offerIds) {
      if (!offerIds.length) return new Map();

      const { data, error } = await supabase
        .from('swap_deals')
        .select('id,offer_id,created_at')
        .in('offer_id', offerIds)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const byOfferId = new Map<string, string>();
      for (const row of data ?? []) {
        const offerId = row.offer_id as string | null;
        const dealId = row.id as string | null;
        if (!offerId || !dealId || byOfferId.has(offerId)) continue;
        byOfferId.set(offerId, dealId);
      }
      return byOfferId;
    },

    async listOwnedActiveItemIds(userId) {
      const { data, error } = await supabase
        .from('items')
        .select('id')
        .eq('owner_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((item) => item.id as string);
    },

    async markThinking(offerId, note) {
      const { error } = await supabase.rpc('mark_offer_thinking', {
        p_offer_id: offerId,
        p_note: note?.trim() || null,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: undefined };
    },

    async softReject(offerId, note) {
      const { error } = await supabase.rpc('soft_reject_offer', {
        p_offer_id: offerId,
        p_note: note?.trim() || null,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: undefined };
    },

    async accept(offerId) {
      const { data: dealId, error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
      if (error || !dealId) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Accepted offer did not return a deal id.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: { dealId: dealId as string } };
    },

    async create(input) {
      const { data, error } = await supabase
        .from('offers')
        .insert({
          requested_item_id: input.requestedItemId,
          offered_item_id: input.offeredItemId,
          sender_id: input.senderId,
          receiver_id: input.receiverId,
          status: 'pending',
          message: input.message?.trim() || null,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Offer insert returned no id.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: { offerId: data.id as string } };
    },

    async recordCreatedEvent(input) {
      const { error } = await supabase.from('offer_events').insert({
        offer_id: input.offerId,
        actor_id: input.actorId,
        event_type: 'created',
        old_status: null,
        new_status: 'pending',
        note: null,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: undefined };
    },
  };
}
