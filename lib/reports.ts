import { supabase } from '@/lib/supabase/client';

export type ReportReason = 'misleading_item' | 'inappropriate_content' | 'spam_offer' | 'unsafe_behavior' | 'no_show' | 'harassment' | 'fraud' | 'other';
const ALLOWED_REASONS: ReportReason[] = ['misleading_item', 'inappropriate_content', 'spam_offer', 'unsafe_behavior', 'no_show', 'harassment', 'fraud', 'other'];

const SUCCESS_MESSAGE = 'تم إرسال البلاغ. هنراجعه في أقرب وقت.';
const FAILURE_MESSAGE = 'تعذر إرسال البلاغ حالياً.';
const RATE_LIMIT_MESSAGE = 'وصلت للحد المسموح من البلاغات مؤقتاً.';

type ReportResult = { ok: true; message?: string } | { ok: false; message: string; reason?: string };
type ParticipantSummary = { id: string; displayName: string | null; username: string | null; avatarUrl: string | null };

function mapRpcError(error: any): ReportResult {
  const message = String(error?.message ?? '');
  if (message.includes('reports_rate_limited')) return { ok: false, message: RATE_LIMIT_MESSAGE, reason: 'rate_limited' };
  return { ok: false, message: FAILURE_MESSAGE, reason: 'unknown' };
}

async function fetchProfile(userId: string): Promise<ParticipantSummary | null> {
  const { data } = await supabase.from('profiles').select('id,display_name,username,avatar_url').eq('id', userId).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, displayName: (data.display_name as string | null) ?? null, username: (data.username as string | null) ?? null, avatarUrl: (data.avatar_url as string | null) ?? null };
}

async function callReportRpc(fn: string, payload: Record<string, unknown>): Promise<ReportResult> {
  const { error } = await supabase.rpc(fn, payload);
  if (error) return mapRpcError(error);
  return { ok: true, message: SUCCESS_MESSAGE };
}

export async function reportUser(input: { reportedUserId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_user', { p_reported_user_id: input.reportedUserId, p_reason: input.reason, p_details: input.details ?? null }); }
export async function reportItem(input: { itemId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_item', { p_item_id: input.itemId, p_reason: input.reason, p_details: input.details ?? null }); }
export async function reportDirectMessage(input: { conversationId: string; streamMessageId: string; reportedUserId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_direct_message', { p_conversation_id: input.conversationId, p_stream_message_id: input.streamMessageId, p_reported_user_id: input.reportedUserId, p_reason: input.reason, p_details: input.details ?? null }); }
export async function reportDeal(input: { dealId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_deal', { p_deal_id: input.dealId, p_reason: input.reason, p_details: input.details ?? null }); }
export async function reportStory(input: { storyId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_story', { p_story_id: input.storyId, p_reason: input.reason, p_details: input.details ?? null }); }
export async function reportDealMessage(input: { dealId: string; dealMessageId: string; reason: string; details?: string | null }): Promise<ReportResult> { return callReportRpc('report_deal_message', { p_deal_id: input.dealId, p_deal_message_id: input.dealMessageId, p_reason: input.reason, p_details: input.details ?? null }); }

// Backward-compatible report screens helpers.
export async function fetchUserReportContext(userId: string, currentUserId: string) { if (userId === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن نفسك.' }; const p = await fetchProfile(userId); if (!p) return { ok: false as const, message: 'المستخدم غير موجود.' }; return { ok: true as const, context: { reportedUser: p } }; }
export async function fetchItemReportContext(itemId: string) { const { data } = await supabase.from('items').select('id,title,owner_id').eq('id', itemId).maybeSingle(); if (!data) return { ok: false as const, message: 'العنصر غير موجود.' }; const owner = await fetchProfile(data.owner_id as string); if (!owner) return { ok: false as const, message: 'تعذر تحميل بيانات صاحب العنصر.' }; return { ok: true as const, context: { itemId, title: ((data.title as string | null)?.trim() || 'عنصر بدون عنوان'), owner } }; }
export async function fetchDealReportContext(dealId: string, currentUserId: string) { const { data: deal } = await supabase.from('swap_deals').select('id,requester_id,offerer_id').eq('id', dealId).maybeSingle(); if (!deal) return { ok: false as const, message: 'الصفقة غير موجودة.' }; const requesterId = deal.requester_id as string; const offererId = deal.offerer_id as string; if (currentUserId !== requesterId && currentUserId !== offererId) return { ok: false as const, message: 'غير مسموح لك بإرسال بلاغ من هذه الصفقة.' }; const reportedUserId = currentUserId === requesterId ? offererId : requesterId; const reportedUser = await fetchProfile(reportedUserId); if (!reportedUser) return { ok: false as const, message: 'تعذر تحميل بيانات الطرف الآخر.' }; return { ok: true as const, context: { dealId, reporterId: currentUserId, reportedUser } }; }
export async function fetchStoryReportContext(storyId: string, currentUserId: string) { const { data } = await supabase.from('stories').select('id,user_id,caption').eq('id', storyId).maybeSingle(); if (!data) return { ok: false as const, message: 'القصة غير موجودة.' }; if ((data.user_id as string) === currentUserId) return { ok: false as const, message: 'لا يمكنك الإبلاغ عن قصتك.' }; const author = await fetchProfile(data.user_id as string); if (!author) return { ok: false as const, message: 'تعذر تحميل بيانات صاحب القصة.' }; return { ok: true as const, context: { storyId, author, caption: (data.caption as string | null) ?? null } }; }

export async function submitUserReport(input: { reportedUserId: string; currentUserId: string; reason: ReportReason; details?: string }) { if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' }; return reportUser({ reportedUserId: input.reportedUserId, reason: input.reason, details: input.details }); }
export async function submitItemReport(input: { itemId: string; currentUserId: string; reason: ReportReason; details?: string }) { if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' }; return reportItem({ itemId: input.itemId, reason: input.reason, details: input.details }); }
export async function submitDealReport(input: { dealId: string; currentUserId: string; reason: ReportReason; details?: string }) { if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' }; return reportDeal({ dealId: input.dealId, reason: input.reason, details: input.details }); }
export async function submitStoryReport(input: { storyId: string; currentUserId: string; reason: ReportReason; details?: string }) { if (!ALLOWED_REASONS.includes(input.reason)) return { ok: false as const, message: 'سبب البلاغ غير صالح.' }; return reportStory({ storyId: input.storyId, reason: input.reason, details: input.details }); }

export { SUCCESS_MESSAGE, FAILURE_MESSAGE, RATE_LIMIT_MESSAGE };
