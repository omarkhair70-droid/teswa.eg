import type {
  AdminReportRecord,
  AdminReportStatus,
  AdminReportTypeFilter,
  ModerationContract,
  ModerationParticipantRecord,
  ReportFailureReason,
} from '@/lib/backend/contracts/moderation';
import { supabase } from '@/lib/supabase/client';

function clean(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function mapReportFailure(error: any): ReportFailureReason {
  const message = String(error?.message ?? '');
  if (message.includes('reports_rate_limited')) return 'rate_limited';
  if (message.includes('invalid_reason')) return 'invalid_reason';
  if (
    message.includes('cannot_report_own_item')
    || message.includes('cannot_report_own_story')
    || message.includes('cannot_report_own_message')
  ) {
    return 'self_target';
  }
  if (
    message.includes('invalid_target')
    || message.includes('invalid_reported_user')
    || message.includes('invalid_message_sender')
  ) {
    return 'invalid_target';
  }
  if (message.includes('not_participant')) return 'unauthorized';
  if (
    message.includes('user_not_found')
    || message.includes('item_not_found')
    || message.includes('deal_not_found')
    || message.includes('story_not_found')
    || message.includes('conversation_not_found')
    || message.includes('message_not_found')
    || message.includes('deal_message_not_found')
  ) {
    return 'not_found';
  }
  return 'unknown';
}

async function callReportRpc(
  fn: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.rpc(fn, payload);
  if (error) {
    return {
      ok: false as const,
      reason: mapReportFailure(error),
      message: error.message,
      cause: error,
    };
  }
  return { ok: true as const, data: undefined };
}

async function fetchProfile(
  userId: string,
): Promise<ModerationParticipantRecord | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? null,
    username: (data.username as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}

function isAdminStatus(value: unknown): value is AdminReportStatus {
  return (
    value === 'open'
    || value === 'reviewing'
    || value === 'actioned'
    || value === 'dismissed'
  );
}

function matchesTypeFilter(row: any, type: AdminReportTypeFilter) {
  if (type === 'all') return true;
  if (type === 'user') {
    return Boolean(row.reported_user_id)
      && !row.reported_item_id
      && !row.story_id
      && !row.reported_deal_id
      && !row.reported_direct_conversation_id
      && !row.reported_stream_message_id
      && !row.reported_deal_message_id;
  }
  if (type === 'item') return Boolean(row.reported_item_id);
  if (type === 'story') return Boolean(row.story_id);
  if (type === 'deal') {
    return Boolean(row.reported_deal_id) && !row.reported_deal_message_id;
  }
  if (type === 'direct_message') {
    return Boolean(
      row.reported_direct_conversation_id
      || row.reported_stream_message_id,
    );
  }
  if (type === 'deal_message') return Boolean(row.reported_deal_message_id);
  return true;
}

export function createSupabaseModerationAdapter(): ModerationContract {
  return {
    getProfile: fetchProfile,

    reportUser(input) {
      return callReportRpc('report_user', {
        p_reported_user_id: input.reportedUserId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    reportItem(input) {
      return callReportRpc('report_item', {
        p_item_id: input.itemId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    reportDirectMessage(input) {
      return callReportRpc('report_direct_message', {
        p_conversation_id: input.conversationId,
        p_stream_message_id: input.messageId,
        p_reported_user_id: input.reportedUserId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    reportDeal(input) {
      return callReportRpc('report_deal', {
        p_deal_id: input.dealId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    reportStory(input) {
      return callReportRpc('report_story', {
        p_story_id: input.storyId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    reportDealMessage(input) {
      return callReportRpc('report_deal_message', {
        p_deal_id: input.dealId,
        p_deal_message_id: input.dealMessageId,
        p_reason: input.reason,
        p_details: input.details,
      });
    },

    async getItemReportContext(itemId) {
      const { data, error } = await supabase
        .from('items')
        .select('id,title,owner_id')
        .eq('id', itemId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const ownerId = data.owner_id as string;
      return {
        itemId: data.id as string,
        title: clean(data.title) ?? 'عنصر بدون عنوان',
        ownerId,
        owner: await fetchProfile(ownerId),
      };
    },

    async getDirectMessageReportContext(input) {
      const { data: conversation, error: conversationError } = await supabase
        .from('direct_conversations')
        .select('id,participant_a,participant_b')
        .eq('id', input.conversationId)
        .maybeSingle();

      if (conversationError) {
        return {
          ok: false,
          reason: 'unknown',
          message: conversationError.message,
          cause: conversationError,
        };
      }
      if (!conversation) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Conversation not found.',
        };
      }

      const participantA = conversation.participant_a as string;
      const participantB = conversation.participant_b as string;
      if (
        input.currentUserId !== participantA
        && input.currentUserId !== participantB
      ) {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'Reporter is not a participant.',
        };
      }

      const otherUserId =
        input.currentUserId === participantA ? participantB : participantA;
      if (input.reportedUserId !== otherUserId) {
        return {
          ok: false,
          reason: 'invalid_target',
          message: 'Reported user is not the other participant.',
        };
      }

      const { data: message, error: messageError } = await supabase
        .from('direct_messages')
        .select('id,sender_id,body,message_type')
        .eq('id', input.messageId)
        .eq('conversation_id', input.conversationId)
        .maybeSingle();

      if (messageError) {
        return {
          ok: false,
          reason: 'unknown',
          message: messageError.message,
          cause: messageError,
        };
      }
      if (!message) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Message not found.',
        };
      }

      const senderId = message.sender_id as string;
      if (senderId === input.currentUserId) {
        return {
          ok: false,
          reason: 'self_target',
          message: 'Cannot report own message.',
        };
      }
      if (senderId !== input.reportedUserId) {
        return {
          ok: false,
          reason: 'invalid_target',
          message: 'Message sender does not match reported user.',
        };
      }

      const reportedUser = await fetchProfile(input.reportedUserId);
      if (!reportedUser) {
        return {
          ok: false,
          reason: 'invalid_target',
          message: 'Reported user profile not found.',
        };
      }

      const rawBody = clean(message.body) ?? '';
      const isVoice = message.message_type === 'voice';
      const preview = isVoice
        ? 'رسالة صوتية داخل المحادثة المباشرة.'
        : rawBody
          ? `“${rawBody.slice(0, 120)}${rawBody.length > 120 ? '…' : ''}”`
          : 'رسالة داخل المحادثة المباشرة.';

      return {
        ok: true,
        data: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          reportedUser,
          preview,
        },
      };
    },

    async getDealReportContext(input) {
      const { data: deal, error } = await supabase
        .from('swap_deals')
        .select('id,requester_id,offerer_id')
        .eq('id', input.dealId)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      if (!deal) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Deal not found.',
        };
      }

      const requesterId = deal.requester_id as string;
      const offererId = deal.offerer_id as string;
      if (
        input.currentUserId !== requesterId
        && input.currentUserId !== offererId
      ) {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'Reporter is not a deal participant.',
        };
      }

      const reportedUserId =
        input.currentUserId === requesterId ? offererId : requesterId;
      const reportedUser = await fetchProfile(reportedUserId);
      if (!reportedUser) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Other participant profile not found.',
        };
      }

      return {
        ok: true,
        data: {
          dealId: input.dealId,
          reporterId: input.currentUserId,
          reportedUser,
        },
      };
    },

    async getStoryReportContext(input) {
      const { data: story, error } = await supabase
        .from('stories')
        .select('id,user_id,caption')
        .eq('id', input.storyId)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      if (!story) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Story not found.',
        };
      }

      const authorId = story.user_id as string;
      if (authorId === input.currentUserId) {
        return {
          ok: false,
          reason: 'self_target',
          message: 'Cannot report own story.',
        };
      }

      const author = await fetchProfile(authorId);
      if (!author) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Story author profile not found.',
        };
      }

      return {
        ok: true,
        data: {
          storyId: input.storyId,
          author,
          caption: (story.caption as string | null) ?? null,
        },
      };
    },

    async isAdmin() {
      const { data, error } = await supabase.rpc('is_admin_user');
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: data === true };
    },

    async listAdminReports(input) {
      const admin = await this.isAdmin();
      if (!admin.ok) return admin;
      if (!admin.data) {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'User is not admin.',
        };
      }

      let query = supabase
        .from('reports')
        .select('id,reporter_id,reported_user_id,reported_item_id,reported_offer_id,reported_deal_id,reported_direct_conversation_id,reported_stream_message_id,reported_deal_message_id,story_id,reason,details,status,action_taken,admin_notes,reviewed_by,reviewed_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (input.status !== 'all') {
        query = query.eq('status', input.status);
      }

      const { data, error } = await query;
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      const rows = (data ?? []).filter((row) =>
        matchesTypeFilter(row, input.type),
      );

      const profileIds = Array.from(
        new Set(
          rows
            .flatMap((row) => [row.reporter_id, row.reported_user_id])
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const itemIds = Array.from(
        new Set(
          rows
            .map((row) => row.reported_item_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const [profilesResult, itemsResult] = await Promise.all([
        profileIds.length
          ? supabase
              .from('profiles')
              .select('id,display_name,username')
              .in('id', profileIds)
          : Promise.resolve({ data: [], error: null }),
        itemIds.length
          ? supabase.from('items').select('id,title').in('id', itemIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesResult.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: profilesResult.error.message,
          cause: profilesResult.error,
        };
      }
      if (itemsResult.error) {
        return {
          ok: false,
          reason: 'unknown',
          message: itemsResult.error.message,
          cause: itemsResult.error,
        };
      }

      const profilesById = new Map(
        (profilesResult.data ?? []).map((profile) => [
          profile.id as string,
          profile,
        ]),
      );
      const itemsById = new Map(
        (itemsResult.data ?? []).map((item) => [item.id as string, item]),
      );

      const profileName = (id: string | null) => {
        if (!id) return undefined;
        const profile = profilesById.get(id);
        if (!profile) return undefined;
        return (
          clean(profile.display_name)
          ?? clean(profile.username)
          ?? id
        );
      };

      const records: AdminReportRecord[] = rows.map((row) => {
        const item = row.reported_item_id
          ? itemsById.get(row.reported_item_id as string)
          : undefined;

        return {
          id: row.id as string,
          reporterId: row.reporter_id as string,
          reportedUserId: (row.reported_user_id as string | null) ?? null,
          reportedItemId: (row.reported_item_id as string | null) ?? null,
          reportedOfferId: (row.reported_offer_id as string | null) ?? null,
          reportedDealId: (row.reported_deal_id as string | null) ?? null,
          reportedDirectConversationId:
            (row.reported_direct_conversation_id as string | null) ?? null,
          reportedStreamMessageId:
            (row.reported_stream_message_id as string | null) ?? null,
          reportedDealMessageId:
            (row.reported_deal_message_id as string | null) ?? null,
          storyId: (row.story_id as string | null) ?? null,
          reason: row.reason as string,
          details: (row.details as string | null) ?? null,
          status: isAdminStatus(row.status) ? row.status : 'open',
          actionTaken: (row.action_taken as string | null) ?? null,
          adminNotes: (row.admin_notes as string | null) ?? null,
          reviewedBy: (row.reviewed_by as string | null) ?? null,
          reviewedAt: (row.reviewed_at as string | null) ?? null,
          createdAt: row.created_at as string,
          reporterName: profileName(row.reporter_id as string),
          reportedUserName: profileName(
            (row.reported_user_id as string | null) ?? null,
          ),
          itemTitle: clean(item?.title) ?? undefined,
        };
      });

      return { ok: true, data: records };
    },

    async reviewReport(input) {
      const { error } = await supabase.rpc('review_report', {
        p_report_id: input.reportId,
        p_status: input.status,
        p_action_taken: input.actionTaken,
        p_admin_notes: input.adminNotes,
      });

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },

    async hideItemForModeration(input) {
      const { error } = await supabase.rpc('hide_item_for_moderation', {
        p_item_id: input.itemId,
        p_report_id: input.reportId,
      });

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },
  };
}
