import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

export type ModerationParticipantRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ReportFailureReason =
  | 'rate_limited'
  | 'invalid_reason'
  | 'self_target'
  | 'invalid_target'
  | 'unauthorized'
  | 'not_found'
  | 'unknown';

export type AdminReportStatus =
  | 'open'
  | 'reviewing'
  | 'actioned'
  | 'dismissed';

export type AdminReportTypeFilter =
  | 'all'
  | 'user'
  | 'item'
  | 'story'
  | 'deal'
  | 'direct_message'
  | 'deal_message';

export type AdminReportRecord = {
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
  reviewedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  reporterName?: string;
  reportedUserName?: string;
  itemTitle?: string;
};

export interface ModerationContract {
  getProfile(
    userId: string,
  ): Promise<ModerationParticipantRecord | null>;

  reportUser(input: {
    reportedUserId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  reportItem(input: {
    itemId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  reportDirectMessage(input: {
    conversationId: string;
    messageId: string;
    reportedUserId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  reportDeal(input: {
    dealId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  reportStory(input: {
    storyId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  reportDealMessage(input: {
    dealId: string;
    dealMessageId: string;
    reason: string;
    details: string | null;
  }): Promise<TeswaResult<void, ReportFailureReason>>;

  getItemReportContext(
    itemId: string,
  ): Promise<
    | {
        itemId: string;
        title: string;
        ownerId: string;
        owner: ModerationParticipantRecord | null;
      }
    | null
  >;

  getDirectMessageReportContext(input: {
    conversationId: string;
    messageId: string;
    reportedUserId: string;
    currentUserId: string;
  }): Promise<
    TeswaResult<
      {
        conversationId: string;
        messageId: string;
        reportedUser: ModerationParticipantRecord;
        preview: string;
      },
      'not_found' | 'unauthorized' | 'invalid_target' | 'self_target' | 'unknown'
    >
  >;

  getDealReportContext(input: {
    dealId: string;
    currentUserId: string;
  }): Promise<
    TeswaResult<
      {
        dealId: string;
        reporterId: string;
        reportedUser: ModerationParticipantRecord;
      },
      'not_found' | 'unauthorized' | 'unknown'
    >
  >;

  getStoryReportContext(input: {
    storyId: string;
    currentUserId: string;
  }): Promise<
    TeswaResult<
      {
        storyId: string;
        author: ModerationParticipantRecord;
        caption: string | null;
      },
      'not_found' | 'self_target' | 'unknown'
    >
  >;

  isAdmin(): Promise<TeswaResult<boolean, 'unknown'>>;

  listAdminReports(input: {
    status: AdminReportStatus | 'all';
    type: AdminReportTypeFilter;
  }): Promise<TeswaResult<AdminReportRecord[], 'unauthorized' | 'unknown'>>;

  reviewReport(input: {
    reportId: string;
    status: Exclude<AdminReportStatus, 'open'>;
    actionTaken: string | null;
    adminNotes: string | null;
  }): Promise<TeswaResult<void, 'unknown'>>;

  hideItemForModeration(input: {
    itemId: string;
    reportId: string | null;
  }): Promise<TeswaResult<void, 'unknown'>>;
}
