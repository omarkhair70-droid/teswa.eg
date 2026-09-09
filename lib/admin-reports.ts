import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { checkIsAdminUser } from '@/lib/admin';

export type AdminReportStatus =
  | 'open'
  | 'reviewing'
  | 'actioned'
  | 'dismissed';

export type AdminReportStatusFilter = AdminReportStatus | 'all';

export type AdminReportTypeFilter =
  | 'all'
  | 'user'
  | 'item'
  | 'story'
  | 'deal'
  | 'direct_message'
  | 'deal_message';

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

export async function fetchAdminReports(
  filter: {
    status?: AdminReportStatusFilter;
    type?: AdminReportTypeFilter;
  } = {},
): Promise<AdminReportsResult> {
  const adminCheck = await checkIsAdminUser();
  if (!adminCheck.ok) return adminCheck;
  if (!adminCheck.isAdmin) {
    return {
      ok: false,
      message: 'غير مسموح لك بعرض بلاغات الإدارة.',
    };
  }

  const result = await teswaBackendRuntime.moderation.listAdminReports({
    status: filter.status ?? 'all',
    type: filter.type ?? 'all',
  });

  if (!result.ok) {
    return { ok: false, message: 'تعذر تحميل البلاغات حالياً.' };
  }

  return {
    ok: true,
    reports: result.data as AdminReportSummary[],
  };
}

export async function reviewAdminReport(input: {
  reportId: string;
  status: Exclude<AdminReportStatus, 'open'>;
  actionTaken?: string | null;
  adminNotes?: string | null;
}): Promise<AdminActionResult> {
  const result = await teswaBackendRuntime.moderation.reviewReport({
    reportId: input.reportId,
    status: input.status,
    actionTaken: input.actionTaken ?? null,
    adminNotes: input.adminNotes ?? null,
  });

  if (!result.ok) {
    return { ok: false, message: 'تعذر تحديث حالة البلاغ.' };
  }

  return { ok: true, message: 'تم تحديث البلاغ.' };
}

export async function hideReportedItem(input: {
  itemId: string;
  reportId?: string | null;
}): Promise<AdminActionResult> {
  const result = await teswaBackendRuntime.moderation.hideItemForModeration({
    itemId: input.itemId,
    reportId: input.reportId ?? null,
  });

  if (!result.ok) {
    return { ok: false, message: 'تعذر إخفاء العنصر.' };
  }

  return { ok: true, message: 'تم إخفاء العنصر وتحديث البلاغ.' };
}
