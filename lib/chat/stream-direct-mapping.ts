function sanitizeConversationId(conversationId: string): string {
  const trimmed = conversationId.trim();
  if (!trimmed) throw new Error('Missing conversationId for Stream direct mapping.');

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getStreamDirectChannelId(conversationId: string): string {
  const safeConversationId = sanitizeConversationId(conversationId);
  if (!safeConversationId) throw new Error('Invalid conversationId for Stream direct mapping.');
  return `teswa-direct-${safeConversationId}`;
}

export function getStreamDirectChannelConfig(input: {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
}): {
  type: 'messaging';
  id: string;
  members: string[];
} {
  const currentUserId = input.currentUserId.trim();
  const otherUserId = input.otherUserId.trim();

  if (!currentUserId || !otherUserId) {
    throw new Error('Missing direct conversation members for Stream mapping.');
  }

  const members = Array.from(new Set([currentUserId, otherUserId]));

  return {
    type: 'messaging',
    id: getStreamDirectChannelId(input.conversationId),
    members,
  };
}
