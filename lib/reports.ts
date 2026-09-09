import { router } from 'expo-router';

import type { ReportFailureReason } from '@/lib/backend/contracts/moderation';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

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

type ReportResult =
  | { ok: true; message?: string }
  | { ok: false; message: string; reason?: string };

type ParticipantSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

function mapReportFailure(reason: ReportFailureReason): ReportResult {
  switch (reason) {
    case 'rate_limited':
      return {
        ok: false,
        message: RATE_LIMIT_MESSAGE,
        reason: 'rate_limited',
      };
    case 'invalid_reason':
      return {
        ok: false,
        message: 'اختار سبب بلاغ صالح وحاول تاني.',
        reason: 'invalid_reason',
      };
    case 'self_target':
      return {
        ok: false,
        message: 'لا يمكنك الإبلاغ عن المحتوى الخاص بك.',
        reason: 'self_target',
      };
    case 'invalid_target':
      return {
        ok: false,
        message: 'تعذر التحقق من الطرف المُبلّغ عنه.',
        reason: 'invalid_target',
      };
    case 'unauthorized':
      return {
        ok: false,
        message: 'غير مسموح لك بإرسال بلاغ من هذا السياق.',
        reason: 'unauthorized',
      };
    case 'not_found':
      return {
        ok: false,
        message: 'المحتوى المطلوب لم يعد متاحاً.',
        reason: 'not_found',
      };
    default:
      return { ok: false, message: FAILURE_MESSAGE, reason: 'unknown' };
  }
}

function toReportResult(
  result:
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportUser>>
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportItem>>
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportDirectMessage>>
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportDeal>>
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportStory>>
    | Awaited<ReturnType<typeof teswaBackendRuntime.moderation.reportDealMessage>>,
): ReportResult {
  if (result.ok) return { ok: true, message: SUCCESS_MESSAGE };
  return mapReportFailure(result.reason);
}

export async function reportUser(input: {
  reportedUserId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  return toReportResult(
    await teswaBackendRuntime.moderation.reportUser({
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      details: input.details ?? null,
    }),
  );
}

export async function reportItem(input: {
  itemId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  const result = await teswaBackendRuntime.moderation.reportItem({
    itemId: input.itemId,
    reason: input.reason,
    details: input.details ?? null,
  });
  if (!result.ok && result.reason === 'self_target') {
    return {
      ok: false,
      message: 'لا يمكنك الإبلاغ عن عنصرك.',
      reason: 'self_target',
    };
  }
  return toReportResult(result);
}

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
    return {
      ok: false,
      message: 'تعذر فتح البلاغ حالياً.',
      reason: 'invalid_target',
    };
  }

  router.push({
    pathname: '/report/direct-message/[messageId]',
    params: { messageId, conversationId, reportedUserId },
  });

  return {
    ok: false,
    message: 'اختار سبب البلاغ وكمل الإرسال.',
    reason: 'reason_required',
  };
}

export async function submitDirectMessageReport(input: {
  conversationId: string;
  messageId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
}): Promise<ReportResult> {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false, message: 'سبب البلاغ غير صالح.' };
  }

  const result = await teswaBackendRuntime.moderation.reportDirectMessage({
    conversationId: input.conversationId,
    messageId: input.messageId,
    reportedUserId: input.reportedUserId,
    reason: input.reason,
    details: input.details ?? null,
  });

  if (!result.ok && result.reason === 'self_target') {
    return {
      ok: false,
      message: 'لا يمكنك الإبلاغ عن رسالتك.',
      reason: 'self_target',
    };
  }

  return toReportResult(result);
}

export async function reportDeal(input: {
  dealId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  return toReportResult(
    await teswaBackendRuntime.moderation.reportDeal({
      dealId: input.dealId,
      reason: input.reason,
      details: input.details ?? null,
    }),
  );
}

export async function reportStory(input: {
  storyId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  const result = await teswaBackendRuntime.moderation.reportStory({
    storyId: input.storyId,
    reason: input.reason,
    details: input.details ?? null,
  });

  if (!result.ok && result.reason === 'self_target') {
    return {
      ok: false,
      message: 'لا يمكنك الإبلاغ عن قصتك.',
      reason: 'self_target',
    };
  }

  return toReportResult(result);
}

export async function reportDealMessage(input: {
  dealId: string;
  dealMessageId: string;
  reason: string;
  details?: string | null;
}): Promise<ReportResult> {
  return toReportResult(
    await teswaBackendRuntime.moderation.reportDealMessage({
      dealId: input.dealId,
      dealMessageId: input.dealMessageId,
      reason: input.reason,
      details: input.details ?? null,
    }),
  );
}

export async function fetchUserReportContext(
  userId: string,
  currentUserId: string,
) {
  if (userId === currentUserId) {
    return { ok: false as const, message: 'لا يمكنك الإبلاغ عن نفسك.' };
  }

  const profile = await teswaBackendRuntime.moderation.getProfile(userId);
  if (!profile) {
    return { ok: false as const, message: 'المستخدم غير موجود.' };
  }

  return { ok: true as const, context: { reportedUser: profile } };
}

export async function fetchItemReportContext(
  itemId: string,
  currentUserId?: string,
) {
  const context =
    await teswaBackendRuntime.moderation.getItemReportContext(itemId);

  if (!context) {
    return { ok: false as const, message: 'العنصر غير موجود.' };
  }

  if (currentUserId && context.ownerId === currentUserId) {
    return {
      ok: false as const,
      message: 'لا يمكنك الإبلاغ عن عنصرك.',
    };
  }

  if (!context.owner) {
    return {
      ok: false as const,
      message: 'تعذر تحميل بيانات صاحب العنصر.',
    };
  }

  return {
    ok: true as const,
    context: {
      itemId: context.itemId,
      title: context.title,
      owner: context.owner,
    },
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
    return {
      ok: false as const,
      message: 'بيانات البلاغ غير مكتملة.',
    };
  }

  const result =
    await teswaBackendRuntime.moderation.getDirectMessageReportContext({
      conversationId,
      messageId,
      reportedUserId,
      currentUserId,
    });

  if (!result.ok) {
    switch (result.reason) {
      case 'unauthorized':
        return {
          ok: false as const,
          message: 'غير مسموح لك بالإبلاغ عن رسالة من هذه المحادثة.',
        };
      case 'invalid_target':
        return {
          ok: false as const,
          message: 'تعذر التحقق من صاحب الرسالة.',
        };
      case 'self_target':
        return {
          ok: false as const,
          message: 'لا يمكنك الإبلاغ عن رسالتك.',
        };
      case 'not_found':
        return {
          ok: false as const,
          message: 'الرسالة أو المحادثة لم تعد متاحة.',
        };
      default:
        return {
          ok: false as const,
          message: 'تعذر تحميل بيانات البلاغ حالياً.',
        };
    }
  }

  return { ok: true as const, context: result.data };
}

export async function fetchDealReportContext(
  dealId: string,
  currentUserId: string,
) {
  const result = await teswaBackendRuntime.moderation.getDealReportContext({
    dealId,
    currentUserId,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return { ok: false as const, message: 'الصفقة غير موجودة.' };
    }
    if (result.reason === 'unauthorized') {
      return {
        ok: false as const,
        message: 'غير مسموح لك بإرسال بلاغ من هذه الصفقة.',
      };
    }
    return {
      ok: false as const,
      message: 'تعذر تحميل بيانات الطرف الآخر.',
    };
  }

  return { ok: true as const, context: result.data };
}

export async function fetchStoryReportContext(
  storyId: string,
  currentUserId: string,
) {
  const result = await teswaBackendRuntime.moderation.getStoryReportContext({
    storyId,
    currentUserId,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      return { ok: false as const, message: 'القصة غير موجودة.' };
    }
    if (result.reason === 'self_target') {
      return {
        ok: false as const,
        message: 'لا يمكنك الإبلاغ عن قصتك.',
      };
    }
    return {
      ok: false as const,
      message: 'تعذر تحميل بيانات صاحب القصة.',
    };
  }

  return { ok: true as const, context: result.data };
}

export async function submitUserReport(input: {
  reportedUserId: string;
  currentUserId: string;
  reason: ReportReason;
  details?: string;
}) {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  }
  return reportUser({
    reportedUserId: input.reportedUserId,
    reason: input.reason,
    details: input.details,
  });
}

export async function submitItemReport(input: {
  itemId: string;
  currentUserId: string;
  reason: ReportReason;
  details?: string;
}) {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  }
  return reportItem({
    itemId: input.itemId,
    reason: input.reason,
    details: input.details,
  });
}

export async function submitDealReport(input: {
  dealId: string;
  currentUserId: string;
  reason: ReportReason;
  details?: string;
}) {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  }
  return reportDeal({
    dealId: input.dealId,
    reason: input.reason,
    details: input.details,
  });
}

export async function submitStoryReport(input: {
  storyId: string;
  currentUserId: string;
  reason: ReportReason;
  details?: string;
}) {
  if (!ALLOWED_REASONS.includes(input.reason)) {
    return { ok: false as const, message: 'سبب البلاغ غير صالح.' };
  }
  return reportStory({
    storyId: input.storyId,
    reason: input.reason,
    details: input.details,
  });
}

export {
  SUCCESS_MESSAGE,
  FAILURE_MESSAGE,
  RATE_LIMIT_MESSAGE,
};
