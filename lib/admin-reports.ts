import { checkIsAdminUser } from '@/lib/admin';
import { supabase } from '@/lib/supabase/client';

export type AdminReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type AdminReportStatusFilter = AdminReportStatus | 'all';
export type AdminReportTypeFilter = 'all' | 'user' | 'item' | 'story' | 'deal' | 'direct_message' | 'deal_message';

export type AdminReportSummary = {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedItemId: string | null;
  reportedOfferId: string | null;
  reportedDealId: string | null;
  reportedDirectConversationId: string | null;
  reportedStreamMessageId: string | null;
  reportedDealMessageId: string | null;
  storyId: string | null;
  reason: string;
  details: string | null;
  status: AdminReportStatus;
  actionTaken: string | null;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reporterName?: string;
  reportedUserName?: string;
  itemTitle?: string;
};

type AdminReportsResult =
  | { ok: true; reports: AdminReportSummary[] }
  | { ok: false; message: string };

type AdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  reported_item_id: string | null;
  reported_offer_id: string | null;
  reported_deal_id: string | null;
  reported_direct_conversation_id: string | null;
  reported_stream_message_id: string | null;
  reported_deal_message_id: string | null;
  story_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  action_taken: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ProfileRow = { id: string; display_name: string | null; username: string | null };
type ItemRow = { id: string; title: string | null };

function cleanText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function profileName(profile: ProfileRow | undefined): string | undefined {
  if (!profile) return undefined;
  return cleanText(profile.display_name) ?? cleanText(profile.username) ?? profile.id;
}

function isReportStatus(value: string): value is AdminReportStatus {
  return value === 'open' || value === 'reviewing' || value === 'actioned' || value === 'dismissed';
}

function matchesTypeFilter(report: ReportRow, type: AdminReportTypeFilter): boolean {
  if (type === 'all') return true;
  if (type === 'user') {
    return Boolean(report.reported_user_id)
      && !report.reported_item_id
      && !report.story_id
      && !report.reported_deal_id
      && !report.reported_direct_conversation_id
      && !report.reported_stream_message_id
      && !report.reported_deal_message_id;
  }
  if (type === 'item') return Boolean(report.reported_item_id);
  if (type === 'story') return Boolean(report.story_id);
  if (type === 'deal') return Boolean(report.reported_deal_id) && !report.reported_deal_message_id;
  if (type === 'direct_message') return Boolean(report.reported_direct_conversation_id || report.reported_stream_message_id);
  if (type === 'deal_message') return Boolean(report.reported_deal_message_id);
  return true;
}

function mapReportRow(row: ReportRow, profilesById: Map<string, ProfileRow>, itemsById: Map<string, ItemRow>): AdminReportSummary {
  const item = row.reported_item_id ? itemsById.get(row.reported_item_id) : undefined;

  return {
    id: row.id,
    reporterId: row.reporter_id,
    reportedUserId: row.reported_user_id,
    reportedItemId: row.reported_item_id,
    reportedOfferId: row.reported_offer_id,
    reportedDealId: row.reported_deal_id,
    reportedDirectConversationId: row.reported_direct_conversation_id,
    reportedStreamMessageId: row.reported_stream_message_id,
    reportedDealMessageId: row.reported_deal_message_id,
    storyId: row.story_id,
    reason: row.reason,
    details: row.details,
    status: isReportStatus(row.status) ? row.status : 'open',
    actionTaken: row.action_taken,
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    reporterName: profileName(profilesById.get(row.reporter_id)),
    reportedUserName: row.reported_user_id ? profileName(profilesById.get(row.reported_user_id)) : undefined,
    itemTitle: cleanText(item?.title),
  };
}

export async function fetchAdminReports(filter: { status?: AdminReportStatusFilter; type?: AdminReportTypeFilter } = {}): Promise<AdminReportsResult> {
  const adminCheck = await checkIsAdminUser();
  if (!adminCheck.ok) return adminCheck;
  if (!adminCheck.isAdmin) return { ok: false, message: 'غير مسموح لك بعرض بلاغات الإدارة.' };

  let query = supabase
    .from('reports')
    .select('id,reporter_id,reported_user_id,reported_item_id,reported_offer_id,reported_deal_id,reported_direct_conversation_id,reported_stream_message_id,reported_deal_message_id,story_id,reason,details,status,action_taken,admin_notes,reviewed_by,reviewed_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filter.status && filter.status !== 'all') {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query;
  if (error) return { ok: false, message: 'تعذر تحميل البلاغات حالياً.' };

  const rows = ((data ?? []) as ReportRow[]).filter((report) => matchesTypeFilter(report, filter.type ?? 'all'));
  const profileIds = Array.from(new Set(rows.flatMap((report) => [report.reporter_id, report.reported_user_id]).filter((id): id is string => Boolean(id))));
  const itemIds = Array.from(new Set(rows.map((report) => report.reported_item_id).filter((id): id is string => Boolean(id))));

  const [profilesResult, itemsResult] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id,display_name,username').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    itemIds.length
      ? supabase.from('items').select('id,title').in('id', itemIds)
      : Promise.resolve({ data: [] as ItemRow[], error: null }),
  ]);

  const profilesById = new Map<string, ProfileRow>(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const itemsById = new Map<string, ItemRow>(((itemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]));

  return { ok: true, reports: rows.map((row) => mapReportRow(row, profilesById, itemsById)) };
}

export async function reviewAdminReport(input: {
  reportId: string;
  status: Exclude<AdminReportStatus, 'open'>;
  actionTaken?: string | null;
  adminNotes?: string | null;
}): Promise<AdminActionResult> {
  const { error } = await supabase.rpc('review_report', {
    p_report_id: input.reportId,
    p_status: input.status,
    p_action_taken: input.actionTaken ?? null,
    p_admin_notes: input.adminNotes ?? null,
  });

  if (error) return { ok: false, message: 'تعذر تحديث حالة البلاغ.' };
  return { ok: true, message: 'تم تحديث البلاغ.' };
}

export async function hideReportedItem(input: { itemId: string; reportId?: string | null }): Promise<AdminActionResult> {
  const { error } = await supabase.rpc('hide_item_for_moderation', {
    p_item_id: input.itemId,
    p_report_id: input.reportId ?? null,
  });

  if (error) return { ok: false, message: 'تعذر إخفاء العنصر.' };
  return { ok: true, message: 'تم إخفاء العنصر وتحديث البلاغ.' };
}
