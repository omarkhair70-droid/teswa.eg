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
  const acceptedRows = rows.filter(
    (row) => row.status === 'accepted',
  );

  if (!acceptedRows.length) {
    return [...rows].sort(
      (a, b) =>
        getConversationSortTimestamp(b) -
        getConversationSortTimestamp(a),
    );
  }

   const client = await getConnectedStreamClient();

  if (!client) {
    return [...rows].sort(
      (a, b) =>
        getConversationSortTimestamp(b) -
        getConversationSortTimestamp(a),
    );
  }

  const conversationsById = new Map(
    rows.map((row) => [row.conversationId, row]),
  );

  await Promise.all(
    acceptedRows.map(async (row) => {
      try {
        const config = getStreamDirectChannelConfig({
          conversationId: row.conversationId,
          currentUserId,
          otherUserId: row.otherUserId,
        });

        const channel = client.channel(
          config.type,
          config.id,
          {
            members: config.members,
          },
        );

        const state = await channel.query({
          messages: { limit: 1 },
        });

        const latestMessage =
          Array.isArray(state?.messages) &&
          state.messages.length > 0
            ? state.messages[state.messages.length - 1]
            : null;

        if (!latestMessage) return;

        const latestMessageTime =
          normalizeStreamDate(latestMessage.created_at) ??
          normalizeStreamDate(latestMessage.updated_at) ??
          row.lastMessageAt;

        const unreadCount =
          typeof channel.countUnread === 'function'
            ? channel.countUnread()
            : row.unreadCount;

        conversationsById.set(row.conversationId, {
          ...row,
          lastMessageBody:
            mapStreamMessagePreview(latestMessage) ??
            row.lastMessageBody,
          lastMessageAt: latestMessageTime,
          unreadCount: Number.isFinite(unreadCount)
            ? Math.max(0, unreadCount)
            : row.unreadCount,
        });
      } catch (error) {
        if (__DEV__) {
          console.log(
            '[DirectInbox] Stream conversation hydration failed',
            {
              conversationId: row.conversationId,
              error,
            },
          );
        }
      }
    }),
  );

  return Array.from(conversationsById.values()).sort(
    (a, b) =>
      getConversationSortTimestamp(b) -
      getConversationSortTimestamp(a),
  );
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