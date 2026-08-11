import { fetchStreamChatToken } from '@/lib/chat/stream-token';
import { getStreamDirectChannelConfig } from '@/lib/chat/stream-direct-mapping';
import type { DirectConversationSummary } from '@/lib/direct-messages';

type StreamPreviewAttachment = {
  type?: string;
  mime_type?: string;
};

function getConversationSortTimestamp(
  item: DirectConversationSummary,
): number {
  const timestamp = item.lastMessageAt
    ? Date.parse(item.lastMessageAt)
    : Number.NaN;

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.NEGATIVE_INFINITY;
}

function mapStreamMessagePreview(message: any): string | null {
  const messageType =
    typeof message?.teswa_type === 'string'
      ? message.teswa_type
      : '';

  if (
    messageType === 'exchange_offer_draft' ||
    messageType === 'exchange_draft'
  ) {
    return 'عرض تبادل مبدئي';
  }

  const attachments: StreamPreviewAttachment[] =
    Array.isArray(message?.attachments)
      ? message.attachments.filter(
          (
            attachment: unknown,
          ): attachment is StreamPreviewAttachment =>
            Boolean(attachment) &&
            typeof attachment === 'object',
        )
      : [];

  if (
    attachments.some(
      (attachment) =>
        typeof attachment.mime_type === 'string' &&
        attachment.mime_type.startsWith('audio/'),
    )
  ) {
    return 'رسالة صوتية';
  }

  if (
    attachments.some(
      (attachment) => attachment.type === 'image',
    )
  ) {
    return 'صورة';
  }

  if (
    attachments.some(
      (attachment) => attachment.type === 'video',
    )
  ) {
    return 'فيديو';
  }

  if (
    attachments.some(
      (attachment) => attachment.type === 'file',
    )
  ) {
    return 'ملف';
  }

  if (
    typeof message?.text === 'string' &&
    message.text.trim().length > 0
  ) {
    return message.text.trim();
  }

  return null;
}

function normalizeStreamDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return null;
}
async function getConnectedStreamClient(): Promise<any | null> {
  try {
    const tokenResult = await fetchStreamChatToken();

    if (!tokenResult.ok) {
      return null;
    }

    const { StreamChat } = await import('stream-chat');
    const client = StreamChat.getInstance(tokenResult.apiKey);

    const connectedUserId =
      typeof client.userID === 'string'
        ? client.userID
        : null;

    if (connectedUserId !== tokenResult.userId) {
      if (
        connectedUserId &&
        typeof client.disconnectUser === 'function'
      ) {
        await client.disconnectUser();
      }

      await client.connectUser(
        { id: tokenResult.userId },
        tokenResult.token,
      );
    }

    return client;
  } catch (error) {
    if (__DEV__) {
      console.log(
        '[DirectInbox] Stream connection failed',
        error,
      );
    }

    return null;
  }
}
export function formatConversationListTime(
  value: string | null,
): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const differenceInDays = Math.round(
    (todayStart.getTime() - dateStart.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  if (differenceInDays === 0) {
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (differenceInDays === 1) {
    return 'أمس';
  }

  return date.toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
  });
}

export async function mergeDirectConversationStreamActivity(
  rows: DirectConversationSummary[],
  currentUserId: string,
): Promise<DirectConversationSummary[]> {
  const fallbackRows = [...rows].sort(
    (a, b) =>
      getConversationSortTimestamp(b) -
      getConversationSortTimestamp(a),
  );

  const acceptedRows = rows.filter(
    (row) => row.status === 'accepted',
  );

  if (!acceptedRows.length) {
    return fallbackRows;
  }

  const client = await getConnectedStreamClient();

  if (!client) {
    return fallbackRows;
  }

  const rowsByChannelId =
    new Map<string, DirectConversationSummary>();

  acceptedRows.forEach((row) => {
    try {
      const config = getStreamDirectChannelConfig({
        conversationId: row.conversationId,
        currentUserId,
        otherUserId: row.otherUserId,
      });

      rowsByChannelId.set(config.id, row);
    } catch (error) {
      if (__DEV__) {
        console.log(
          '[DirectInbox] Invalid Stream channel mapping',
          {
            conversationId: row.conversationId,
            error,
          },
        );
      }
    }
  });

  if (!rowsByChannelId.size) {
    return fallbackRows;
  }

  try {
    const channels = await client.queryChannels(
      {
        type: 'messaging',
        members: { $in: [currentUserId] },
      },
      [{ last_message_at: -1 }],
      {
        state: true,
        watch: false,
        presence: false,
        limit: 30,
        message_limit: 1,
        member_limit: 2,
      },
    );

    const conversationsById = new Map(
      rows.map((row) => [row.conversationId, row]),
    );

    channels.forEach((channel: any) => {
      const channelId =
        typeof channel?.id === 'string'
          ? channel.id
          : '';

      const row = rowsByChannelId.get(channelId);

      if (!row) return;

      const channelMessages =
        Array.isArray(channel.state?.messages)
          ? channel.state.messages
          : [];

      const latestMessage =
        channelMessages.length > 0
          ? channelMessages[channelMessages.length - 1]
          : null;

      const latestMessageTime = latestMessage
        ? (
            normalizeStreamDate(latestMessage.created_at) ??
            normalizeStreamDate(latestMessage.updated_at) ??
            row.lastMessageAt
          )
        : row.lastMessageAt;

      const unreadCount =
        typeof channel.countUnread === 'function'
          ? channel.countUnread()
          : row.unreadCount;

      conversationsById.set(row.conversationId, {
        ...row,
        lastMessageBody: latestMessage
          ? (
              mapStreamMessagePreview(latestMessage) ??
              row.lastMessageBody
            )
          : row.lastMessageBody,
        lastMessageAt: latestMessageTime,
        unreadCount: Number.isFinite(unreadCount)
          ? Math.max(0, unreadCount)
          : row.unreadCount,
      });
    });

    return Array.from(conversationsById.values()).sort(
      (a, b) =>
        getConversationSortTimestamp(b) -
        getConversationSortTimestamp(a),
    );
  } catch (error) {
    if (__DEV__) {
      console.log(
        '[DirectInbox] Stream inbox query failed',
        error,
      );
    }

    return fallbackRows;
  }
}
export async function subscribeToDirectInboxStreamUpdates(
  onUpdate: () => void,
): Promise<() => void> {
    const client = await getConnectedStreamClient();

  if (!client) {
    return () => {};
  }
  const subscriptions = [
    client.on('message.new', onUpdate),
    client.on('message.updated', onUpdate),
    client.on('message.deleted', onUpdate),
  ];

  return () => {
    subscriptions.forEach((subscription: any) => {
      if (typeof subscription?.unsubscribe === 'function') {
        subscription.unsubscribe();
      } else if (typeof subscription === 'function') {
        subscription();
      }
    });
  };
}