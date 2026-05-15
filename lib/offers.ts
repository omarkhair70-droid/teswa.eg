import { supabase } from '@/lib/supabase/client';

export type OfferInvalidReason = 'requested_not_found' | 'requested_inactive' | 'own_requested_item' | 'offered_not_found' | 'offered_inactive' | 'offered_not_owned' | 'same_item';

type ItemValidationRow = {
  id: string;
  title: string | null;
  owner_id: string;
  status: string;
};

type MarketplaceSummaryRow = {
  id: string;
  title: string | null;
  cover_image_url: string | null;
  category: string | null;
  item_condition: string | null;
  city: string | null;
  owner_display_name: string | null;
};

export type OfferItemSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  condition: string | null;
  location: string | null;
  ownerDisplayName: string | null;
};

export type OfferCreationContextResult =
  | { ok: true; requestedItem: OfferItemSummary; myActiveItems: OfferItemSummary[] }
  | { ok: false; reason: OfferInvalidReason; message: string };

export type CreateSwapOfferResult =
  | { ok: true; offerId: string }
  | { ok: false; reason: OfferInvalidReason | 'unknown'; message: string };

export type OfferDetail = {
  id: string;
  status: string;
  message: string | null;
  requestedItemId: string;
  offeredItemId: string;
  senderId: string;
  receiverId: string;
  createdAt: string | null;
  requestedItem: OfferItemSummary | null;
  offeredItem: OfferItemSummary | null;
};

const summarySelect = `id,title,cover_image_url,category,item_condition,city,owner_display_name`;

function mapSummary(row: MarketplaceSummaryRow): OfferItemSummary {
  return {
    id: row.id,
    title: row.title?.trim() || 'عنصر بدون عنوان',
    imageUrl: row.cover_image_url,
    category: row.category,
    condition: row.item_condition,
    location: row.city,
    ownerDisplayName: row.owner_display_name,
  };
}

function getInvalidMessage(reason: OfferInvalidReason): string {
  const messages: Record<OfferInvalidReason, string> = {
    requested_not_found: 'العنصر المطلوب غير موجود.',
    requested_inactive: 'العنصر المطلوب غير متاح حالياً للتبديل.',
    own_requested_item: 'لا يمكنك إرسال عرض على عنصرك الخاص.',
    offered_not_found: 'العنصر الذي اخترته للعرض غير موجود.',
    offered_inactive: 'العنصر الذي اخترته غير نشط حالياً.',
    offered_not_owned: 'يمكنك فقط العرض بعنصر تملكه أنت.',
    same_item: 'لا يمكن استخدام نفس العنصر كعنصر مطلوب ومعروض.',
  };

  return messages[reason];
}

async function fetchItemValidation(itemId: string): Promise<ItemValidationRow | null> {
  const { data, error } = await supabase
    .from('items')
    .select('id,title,owner_id,status')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throw error;
  return (data as ItemValidationRow | null) ?? null;
}

async function fetchMarketplaceSummariesByIds(itemIds: string[]): Promise<OfferItemSummary[]> {
  if (itemIds.length === 0) return [];

  const { data, error } = await supabase
    .from('marketplace_items')
    .select(summarySelect)
    .in('id', itemIds);

  if (error) throw error;

  const byId = new Map((data ?? []).map((row) => [row.id, mapSummary(row as MarketplaceSummaryRow)]));
  return itemIds
    .map((id) => byId.get(id))
    .filter((item): item is OfferItemSummary => Boolean(item));
}

export async function fetchOfferCreationContext(requestedItemId: string, currentUserId: string): Promise<OfferCreationContextResult> {
  const requested = await fetchItemValidation(requestedItemId);

  if (!requested) return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') };
  if (requested.status !== 'active') return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') };
  if (requested.owner_id === currentUserId) return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') };

  const { data: myItems, error: myItemsError } = await supabase
    .from('items')
    .select('id')
    .eq('owner_id', currentUserId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (myItemsError) throw myItemsError;

  const myItemIds = (myItems ?? []).map((item) => item.id as string);
  const [requestedDisplay] = await fetchMarketplaceSummariesByIds([requestedItemId]);
  const myActiveItems = await fetchMarketplaceSummariesByIds(myItemIds);

  return {
    ok: true,
    requestedItem: requestedDisplay ?? {
      id: requested.id,
      title: requested.title?.trim() || 'عنصر بدون عنوان',
      imageUrl: null,
      category: null,
      condition: null,
      location: null,
      ownerDisplayName: null,
    },
    myActiveItems,
  };
}

export async function createSwapOffer(input: {
  requestedItemId: string;
  offeredItemId: string;
  message?: string;
  currentUserId: string;
}): Promise<CreateSwapOfferResult> {
  const { requestedItemId, offeredItemId, message, currentUserId } = input;

  if (requestedItemId === offeredItemId) {
    return { ok: false, reason: 'same_item', message: getInvalidMessage('same_item') };
  }

  const requested = await fetchItemValidation(requestedItemId);
  if (!requested) return { ok: false, reason: 'requested_not_found', message: getInvalidMessage('requested_not_found') };
  if (requested.status !== 'active') return { ok: false, reason: 'requested_inactive', message: getInvalidMessage('requested_inactive') };
  if (requested.owner_id === currentUserId) return { ok: false, reason: 'own_requested_item', message: getInvalidMessage('own_requested_item') };

  const offered = await fetchItemValidation(offeredItemId);
  if (!offered) return { ok: false, reason: 'offered_not_found', message: getInvalidMessage('offered_not_found') };
  if (offered.status !== 'active') return { ok: false, reason: 'offered_inactive', message: getInvalidMessage('offered_inactive') };
  if (offered.owner_id !== currentUserId) return { ok: false, reason: 'offered_not_owned', message: getInvalidMessage('offered_not_owned') };

  const trimmedMessage = message?.trim() || null;

  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({
      requested_item_id: requestedItemId,
      offered_item_id: offeredItemId,
      sender_id: currentUserId,
      receiver_id: requested.owner_id,
      status: 'pending',
      message: trimmedMessage,
    })
    .select('id')
    .single();

  if (offerError || !offer) {
    return { ok: false, reason: 'unknown', message: 'تعذر إنشاء العرض حالياً. حاول مرة أخرى.' };
  }

  const { error: eventError } = await supabase.from('offer_events').insert({
    offer_id: offer.id,
    actor_id: currentUserId,
    event_type: 'created',
    old_status: null,
    new_status: 'pending',
    note: null,
  });

  if (eventError) {
    return { ok: false, reason: 'unknown', message: 'تم إنشاء العرض لكن تعذر تسجيل الحدث. حاول مرة أخرى.' };
  }

  const notificationBody = requested.title?.trim()
    ? `لديك عرض جديد على "${requested.title.trim()}".`
    : 'لديك عرض تبديل جديد.';

  const { error: notificationError } = await supabase.rpc('create_notification', {
    target_user_id: requested.owner_id,
    notification_type: 'offer_received',
    notification_title: 'وصلك عرض جديد',
    notification_body: notificationBody,
    target_item_id: requestedItemId,
    target_offer_id: offer.id,
    target_deal_id: null,
  });

  if (notificationError && __DEV__) {
    console.log('[offers] create_notification failed', notificationError);
  }

  return { ok: true, offerId: offer.id };
}

export async function fetchOfferById(offerId: string): Promise<OfferDetail | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('id,status,message,requested_item_id,offered_item_id,sender_id,receiver_id,created_at')
    .eq('id', offerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const requestedItemId = data.requested_item_id as string;
  const offeredItemId = data.offered_item_id as string;
  const [requestedItem, offeredItem] = await Promise.all([
    fetchMarketplaceSummariesByIds([requestedItemId]).then((rows) => rows[0] ?? null),
    fetchMarketplaceSummariesByIds([offeredItemId]).then((rows) => rows[0] ?? null),
  ]);

  return {
    id: data.id as string,
    status: data.status as string,
    message: (data.message as string | null) ?? null,
    requestedItemId,
    offeredItemId,
    senderId: data.sender_id as string,
    receiverId: data.receiver_id as string,
    createdAt: (data.created_at as string | null) ?? null,
    requestedItem,
    offeredItem,
  };
}
