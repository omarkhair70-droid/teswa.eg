const DIRECT_CHANNEL_PREFIX = 'teswa-direct-';
const DIRECT_CHANNEL_TYPE = 'messaging';

function sanitizeConversationId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function getDirectChannelId(conversationId: string) {
  const safeConversationId = sanitizeConversationId(conversationId);
  if (!safeConversationId) throw new Error('Invalid Direct conversation id.');
  return `${DIRECT_CHANNEL_PREFIX}${safeConversationId}`;
}

export function getDirectChannelConfig(input: {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
}) {
  const currentUserId = input.currentUserId.trim();
  const otherUserId = input.otherUserId.trim();
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) throw new Error('Invalid Direct Chat members.');
  return {
    type: DIRECT_CHANNEL_TYPE,
    id: getDirectChannelId(input.conversationId),
    members: [currentUserId, otherUserId],
  } as const;
}
