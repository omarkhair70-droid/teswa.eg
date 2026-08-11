import { router } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

export type ReportReason =
  | 'misleading_item'
  | 'inappropriate_content'
  | 'spam_offer'
  | 'unsafe_behavior'
  | 'no_show'
  | 'harassment'
  | 'fraud'
  | 'other';

const ALLOWED_REASONS: ReportReason[] = [
  'misleading_item',
  'inappropriate_content',
  'spam_offer',
  'unsafe_behavior',
  'no_show',
  'harassment',
  'fraud',
  'other',
];

const SUCCESS_MESSAGE = 'تم إرسال البلاغ. هنراجعه في أقرب وقت.';
const FAILURE_MESSAGE = 'تعذر إرسال البلاغ حالياً.';
const RATE_LIMIT_MESSAGE = 'وصلت للحد المسموح من البلاغات مؤقتاً.';

type ReportResult = { ok: true; message?: string } | { ok: false; message: string; reason?: string };
type ParticipantSummary = { id: string; displayName: string | null; username: string | null; avatarUrl: string | null };

function mapRpcError(error: any): ReportResult {
  const message = String(error?.message ?? '');
  if (message.includes('reports_rate_limited')) return { ok: false, message: RATE_LIMIT_MESSAGE, reason: 'rate_limited' };
  if (message.includes('invalid_reason')) return { ok: false, message: 'اختار سبب بلاغ صالح وحاول تاني.', reason: 'invalid_reason' };
  if (message.includes('cannot_report_own_item')) return { ok: false, message: 'لا يمكنك الإبلاغ عن عنصرك.', reason: 'self_target' };
  if (message.includes('cannot_report_own_story')) return { ok: false, message: 'لا يمكنك الإبلاغ عن قصتك.', reason: 'self_target' };
  if (message.includes('cannot_report_own_message')) return { ok: false, message: 'لا يمكنك الإبلاغ عن رسالتك.', reason: 'self_target' };
  if (message.includes('invalid_target')) return { ok: false, message: 'لا يمكنك الإبلاغ عن هذا الحساب.', reason: 'invalid_target' };
  if (message.includes('not_participant')) return { ok: false, message: 'غير مسموح لك بإرسال بلاغ من هذا السياق.', reason: 'unauthorized' };
  if (message.includes('invalid_reported_user') || message.includes('invalid_message_sender')) return { ok: false, message: 'تعذر التحقق من الطرف المُبلّغ عنه.', reason: 'invalid_target' };
  if (
    message.includes('user_not_found') ||
    message.includes('item_not_found') ||
    message.includes('deal_not_found') ||
    message.includes('story_not_found') ||
    message.includes('conversation_not_found') ||
    message.includes('message_not_found') ||
    message.includes('deal_message_not_found')
  ) {
    return { ok: false, message: 'المحتوى المطلوب لم يعد متاحاً.', reason: 'not_found' };
  }
  return { ok: false, message: FAILURE_MESSAGE, reason: 'unknown' };
}

async function fetchProfile(userId: string): Promise<ParticipantSummary | null> {
  const { data } = await supabase.from('profiles').select('id,display_name,username,avatar_url').eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? null,
    username: (data.username as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}

async function callReportRpc(fn: string, payload: Record<string, unknown>): Promise<ReportResult> {
  const { error } = await supabase.rpc(fn, payload);
  if (error) return mapRpcError(error);
  return { ok: true, message: SUCCESS_MESSAGE };
}

export async function reportUser(input: { reportedUserId: string; reason: string; details?: string | null }): Promise<ReportResult> {
  return callReportRpc('report_user', {
    p_reported_user_id: input.reportedUserId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

export async function reportItem(input: { itemId: string; reason: string; details?: string | null }): Promise<ReportResult> {
  return callReportRpc('report_item', {
    p_item_id: input.itemId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

// Compatibility entrypoint used by the large Direct screen. Instead of silently
// assuming harassment, route the user into the shared report-reason experience.
export async function reportDirectMessage(input: {
  conversationId: string;
  streamMessageId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  const conversationId = input.conversationId.trim();
  const messageId = input.streamMessageId.trim();
  const reportedUserId = input.reportedUserId.trim();

  if (!conversationId || !messageId || !reportedUserId) {
    return { ok: false, message: 'تعذر فتح البلاغ حالياً.', reason: 'invalid_target' };
  }

  router.push({
    pathname: '/report/direct-message/[messageId]',
    params: { messageId, conversationId, reportedUserId },
  });

  return { ok: false, message: 'اختار سبب البلاغ وكمل الإرسال.', reason: 'reason_required' };
}

export async function submitDirectMessageReport(input: {
  conversationId: string;
  messageId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
}): Promise<ReportResult> {
  if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false, message: 'سبب البلاغ غير صالح.' };
  return callReportRpc('report_direct_message', {
    p_conversation_id: input.conversationId,
    p_stream_message_id: input.messageId,
    p_reported_user_id: input.reportedUserId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

export async function reportDeal(input: { dealId: string; reason: string; details?: string | null }): Promise<ReportResult> {
  return callReportRpc('report_deal', {
    p_deal_id: input.dealId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

export async function reportStory(input: { storyId: string; reason: string; details?: string | null }): Promise<ReportResult> {
  return callReportRpc('report_story', {
    p_story_id: input.storyId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

export async function reportDealMessage(input: { dealId: string; dealMessageId: string; reason: string; details?: string | null }): Promise<ReportResult> {
  return callReportRpc('report_deal_message', {
    p_deal_id: input.dealId,
    p_deal_message_id: input.dealMessageId,
    p_reason: input.reason,
    p_details: input.details ?? null,
  });
}

export async function fetchUserReportContext(userId: string, currentUserId: string) {
  if (userId === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن نفسك.' };
  const profile = await fetchProfile(userId);
  if (!profile) return { ok: false as const, message: 'المستخدم غير موجود.' };
  return { ok: true as const, context: { reportedUser: profile } };
}

export async function fetchItemReportContext(itemId: string, currentUserId?: string) {
  const { data } = await supabase.from('items').select('id,title,owner_id').eq('id', itemId).maybeSingle();
  if (!data) return { ok: false as const, message: 'العنصر غير موجود.' };
  if (currentUserId && data.owner_id === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن عنصرك.' };
  const owner = await fetchProfile(data.owner_id as string);
  if (!owner) return { ok: false as const, message: 'تعذر تحميل بيانات صاحب العنصر.' };
  return {
    ok: true as const,
    context: { itemId, title: ((data.title as string | null)?.trim() || 'عنصر بدون عنوان'), owner },
  };
}

export async function fetchDirectMessageReportContext(input: {
  conversationId: string;
  messageId: string;
  reportedUserId: string;
  currentUserId: string;
}) {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  const reportedUserId = input.reportedUserId.trim();
  const currentUserId = input.currentUserId.trim();
  if (!conversationId || !messageId || !reportedUserId || !currentUserId) {
    return { ok: false as const, message: 'بيانات البلاغ غير مكتملة.' };
  }

  const { data: conversation } = await supabase
    .from('direct_conversations')
    .select('id,participant_a,participant_b')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conversation) return { ok: false as const, message: 'المحادثة لم تعد متاحة.' };

  const participantA = conversation.participant_a as string;
  const participantB = conversation.participant_b as string;
  if (currentUserId !== participantA && currentUserId !== participantB) {
    return { ok: false as const, message: 'غير مسموح لك بالإبلاغ عن رسالة من هذه المحادثة.' };
  }

  const otherUserId = currentUserId === participantA ? participantB : participantA;
  if (reportedUserId !== otherUserId) {
    return { ok: false as const, message: 'تعذر التحقق من صاحب الرسالة.' };
  }

  const { data: message } = await supabase
    .from('direct_messages')
    .select('id,sender_id,body,message_type')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (!message) return { ok: false as const, message: 'الرسالة لم تعد متاحة.' };
  if ((message.sender_id as string) === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن رسالتك.' };
  if ((message.sender_id as string) !== reportedUserId) return { ok: false as const, message: 'تعذر التحقق من صاحب الرسالة.' };

  const reportedUser = await fetchProfile(reportedUserId);
  if (!reportedUser) return { ok: false as const, message: 'تعذر تحميل بيانات صاحب الرسالة.' };

  const rawBody = ((message.body as string | null) ?? '').trim();
  const messageType = message.message_type === 'voice' ? 'voice' : 'text';
  const preview = messageType === 'voice'
    ? 'رسالة صوتية داخل المحادثة المباشرة.'
    : rawBody
      ? `“${rawBody.slice(0, 120)}${rawBody.length > 120 ? '…' : ''}”`
      : 'رسالة داخل المحادثة المباشرة.';

  return { ok: true as const, context: { conversationId, messageId, reportedUser, preview } };
}

export async function fetchDealReportContext(dealId: string, currentUserId: string) {
  const { data: deal } = await supabase.from('swap_deals').select('id,requester_id,offerer_id').eq('id', dealId).maybeSingle();
  if (!deal) return { ok: false as const, message: 'الصفقة غير موجودة.' };
  const requesterId = deal.requester_id as string;
  const offererId = deal.offerer_id as string;
  if (currentUserId !== requesterId && currentUserId !== offererId) return { ok: false as const, message: 'غير مسموح لك بإرسال بلاغ من هذه الصفقة.' };
  const reportedUserId = currentUserId === requesterId ? offererId : requesterId;
  const reportedUser = await fetchProfile(reportedUserId);
  if (!reportedUser) return { ok: false as const, message: 'تعذر تحميل بيانات الطرف الآخر.' };
  return { ok: true as const, context: { dealId, reporterId: currentUserId, reportedUser } };
}

export async function fetchStoryReportContext(storyId: string, currentUserId: string) {
  const { data } = await supabase.from('stories').select('id,user_id,caption').eq('id', storyId).maybeSingle();
  if (!data) return { ok: false as const, message: 'القصة غير موجودة.' };
  if ((data.user_id as string) === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن قصتك.' };
  const author = await fetchProfile(data.user_id as string);
  if (!author) return { ok: false as const, message: 'تعذر تحميل بيانات صاحب القصة.' };
  return { ok: true as const, context: { storyId, author, caption: (data.caption as string | null) ?? null } };
}

export async function submitUserReport(input: { reportedUserId: string; currentUserId: string; reason: ReportReason; details?: string }) {
  if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  return reportUser({ reportedUserId: input.reportedUserId, reason: input.reason, details: input.details });
}

export async function submitItemReport(input: { itemId: string; currentUserId: string; reason: ReportReason; details?: string }) {
  if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  return reportItem({ itemId: input.itemId, reason: input.reason, details: input.details });
}

export async function submitDealReport(input: { dealId: string; currentUserId: string; reason: ReportReason; details?: string }) {
  if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  return reportDeal({ dealId: input.dealId, reason: input.reason, details: input.details });
}

export async function submitStoryReport(input: { storyId: string; currentUserId: string; reason: ReportReason; details?: string }) {
  if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  return reportStory({ storyId: input.storyId, reason: input.reason, details: input.details });
}

export { SUCCESS_MESSAGE, FAILURE_MESSAGE, RATE_LIMIT_MESSAGE };
