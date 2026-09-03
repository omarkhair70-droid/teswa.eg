import type {
  DealLifecycleContract,
  DealLifecycleMessageRecord,
  DealLifecycleRecord,
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


function mapDeal(row: any): DealLifecycleRecord {
  return {
    id: row.id as string,
    status: row.status as DealLifecycleRecord['status'],
    acceptedAt: (row.accepted_at as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    requestedItemId: row.requested_item_id as string,
    offeredItemId: row.offered_item_id as string,
    requesterId: row.requester_id as string,
    offererId: row.offerer_id as string,
  };
}

function mapDealMessage(row: any): DealLifecycleMessageRecord {
  return {
    id: row.id as string,
    dealId: row.deal_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    messageType: row.message_type === 'voice' ? 'voice' : 'text',
    audioStoragePath: (row.audio_storage_path as string | null) ?? null,
    audioDurationMs: (row.audio_duration_ms as number | null) ?? null,
    audioMimeType: (row.audio_mime_type as string | null) ?? null,
    audioSizeBytes: (row.audio_size_bytes as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

const DEAL_SELECT =
  'id,status,accepted_at,created_at,requested_item_id,offered_item_id,requester_id,offerer_id';
const DEAL_MESSAGE_SELECT =
  'id,deal_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,created_at';

export function createSupabaseDealLifecycleAdapter(): DealLifecycleContract {
  return {
    async getDeal(dealId) {
      const { data, error } = await supabase
        .from('swap_deals')
        .select(DEAL_SELECT)
        .eq('id', dealId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDeal(data) : null;
    },

    async getUnreadCount() {
      const { data, error } = await supabase.rpc('get_unread_deal_messages_count');
      if (error) throw error;
      return typeof data === 'number' ? Math.max(0, data) : 0;
    },

    async listConfirmationUserIds(dealId) {
      const { data, error } = await supabase
        .from('deal_confirmations')
        .select('user_id')
        .eq('deal_id', dealId);
      if (error) throw error;
      return (data ?? []).map((row) => row.user_id as string);
    },

    async listMessages(dealId, limit = 100) {
      const { data, error } = await supabase
        .from('deal_messages')
        .select(DEAL_MESSAGE_SELECT)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(mapDealMessage);
    },

    async hasReview(dealId, reviewerId) {
      const { count, error } = await supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('reviewer_id', reviewerId);
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: (count ?? 0) > 0 };
    },

    async markRead(dealId) {
      const { error } = await supabase.rpc('mark_deal_thread_read', { p_deal_id: dealId });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: undefined };
    },

    async countMessagesSince(dealId, senderId, since) {
      const { count, error } = await supabase
        .from('deal_messages')
        .select('id', { head: true, count: 'exact' })
        .eq('deal_id', dealId)
        .eq('sender_id', senderId)
        .gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },

    async insertTextMessage(input) {
      const { data, error } = await supabase
        .from('deal_messages')
        .insert({
          deal_id: input.dealId,
          sender_id: input.senderId,
          body: input.body,
        })
        .select(DEAL_MESSAGE_SELECT)
        .single();
      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Message insert returned no row.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: mapDealMessage(data) };
    },

    async insertVoiceMessage(input) {
      const { data, error } = await supabase
        .from('deal_messages')
        .insert({
          deal_id: input.dealId,
          sender_id: input.senderId,
          body: input.body,
          message_type: 'voice',
          audio_storage_path: input.audioStoragePath,
          audio_duration_ms: input.audioDurationMs,
          audio_mime_type: input.audioMimeType,
          audio_size_bytes: input.audioSizeBytes,
        })
        .select(DEAL_MESSAGE_SELECT)
        .single();
      if (error || !data) {
        return {
          ok: false,
          reason: 'unknown',
          message: error?.message ?? 'Voice message insert returned no row.',
          cause: error ?? undefined,
        };
      }
      return { ok: true, data: mapDealMessage(data) };
    },

    async confirm(input) {
      const { error } = await supabase.from('deal_confirmations').insert({
        deal_id: input.dealId,
        user_id: input.userId,
        note: input.note?.trim() || null,
      });
      if (error && error.code !== '23505') {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async completeIfReady(dealId) {
      const { data, error } = await supabase.rpc('complete_deal_if_ready', {
        p_deal_id: dealId,
      });
      if (error) return { ok: false, reason: 'unknown', message: error.message, cause: error };
      return { ok: true, data: Boolean(data) };
    },
  };
}
