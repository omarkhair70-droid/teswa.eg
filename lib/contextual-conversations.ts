import { supabase } from '@/lib/supabase/client';

export type ContextualConversationType = 'story_reply';

export type ContextualConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type ContextualMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type StoryReplySendResult =
  | {
      ok: true;
      conversationId: string;
      messageId: string;
    }
  | {
      ok: false;
      reason: 'invalid_user' | 'invalid_story' | 'invalid_body' | 'send_failed';
      message: string;
    };

export type ContextualParticipantSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type ContextualConversationSummary = {
  conversationId: string;
  contextType: 'story_reply';
  contextEntityId: string;
  otherParticipant: ContextualParticipantSummary;
  latestMessage: {
    id: string;
    body: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastActivityAt: string;
};

export type ContextualThreadResult =
  | {
      ok: true;
      thread: {
        id: string;
        contextType: 'story_reply';
        contextEntityId: string;
        starterId: string;
        recipientId: string;
        otherParticipant: ContextualParticipantSummary;
        messages: ContextualConversationMessage[];
      };
    }
  | { ok: false; reason: 'not_found' | 'unauthorized' };

export type SendContextualMessageResult =
  | { ok: true; message: ContextualConversationMessage }
  | { ok: false; reason: 'invalid_body' | 'send_failed'; message: string };


async function notifyContextualMessageFromMobile(input: {
  conversationId: string;
  messageId: string;
  kind: 'story_reply_initial' | 'thread_message';
}): Promise<void> {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();

  if (!conversationId || !messageId) return;

  const { error } = await supabase.rpc('create_contextual_message_notification', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
    p_kind: input.kind,
  });

  if (error && __DEV__) {
    console.warn('[contextual-conversations] create contextual notification failed', error);
  }
}
export async function markContextualThreadReadFromMobile(conversationId: string): Promise<void> {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) return;

  const { error } = await supabase.rpc('mark_contextual_thread_read', {
    p_conversation_id: normalizedConversationId,
  });

  if (error && __DEV__) {
    console.warn('[contextual-conversations] mark read failed', error);
  }
}

export async function fetchUnreadContextualMessagesCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_contextual_messages_count');

  if (error) {
    if (__DEV__) {
      console.warn('[contextual-conversations] unread count failed', error);
    }
    return 0;
  }

  return typeof data === 'number' ? Math.max(0, data) : 0;
}

export async function sendStoryReplyFromMobile(input: {
  storyId: string;
  currentUserId: string;
  body: string;
}): Promise<StoryReplySendResult> {
  const currentUserId = input.currentUserId.trim();
  const storyId = input.storyId.trim();
  const body = input.body.trim();

  if (!currentUserId) return { ok: false, reason: 'invalid_user', message: 'يجب تسجيل الدخول أولاً للرد على القصة.' };
  if (!storyId) return { ok: false, reason: 'invalid_story', message: 'تعذر تحديد القصة المطلوبة.' };
  if (!body) return { ok: false, reason: 'invalid_body', message: 'اكتب ردك أولاً.' };
  if (body.length > 800) return { ok: false, reason: 'invalid_body', message: 'الرد طويل زيادة عن الحد (800 حرف).' };

  const { data, error } = await supabase.rpc('create_story_reply_thread', {
    p_story_id: storyId,
    p_body: body,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.conversation_id || !row?.message_id) {
    if (__DEV__) {
      console.warn('[contextual-conversations] create story reply failed', error, data);
    }
    return { ok: false, reason: 'send_failed', message: 'تعذر إرسال الرد حالياً. قد تكون القصة انتهت.' };
  }

  void notifyContextualMessageFromMobile({
    conversationId: row.conversation_id,
    messageId: row.message_id,
    kind: 'story_reply_initial',
  });

  return { ok: true, conversationId: row.conversation_id, messageId: row.message_id };
}

export async function fetchContextualConversationSummariesForUser(userId: string): Promise<ContextualConversationSummary[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];

  const { data: conversations, error: conversationsError } = await supabase
    .from('contextual_conversations')
    .select('id, context_type, context_entity_id, starter_id, recipient_id, created_at, updated_at')
    .eq('context_type', 'story_reply')
    .or(`starter_id.eq.${normalizedUserId},recipient_id.eq.${normalizedUserId}`);

  if (conversationsError) throw conversationsError;
  if (!conversations?.length) return [];

  const conversationIds = conversations.map((c) => c.id);
  const participantIds = Array.from(
    new Set(conversations.flatMap((c) => [c.starter_id, c.recipient_id])),
  );

  const [profilesRes, messagesRes, readsRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', participantIds),
    supabase
      .from('contextual_messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('contextual_message_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', normalizedUserId)
      .in('conversation_id', conversationIds),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (readsRes.error) throw readsRes.error;

  const messagesRows = (messagesRes.data ?? []) as ContextualMessageRow[];

  const profilesById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const messagesByConversation = new Map<string, ContextualMessageRow[]>();
  for (const message of messagesRows) {
    const arr = messagesByConversation.get(message.conversation_id) ?? [];
    arr.push(message);
    messagesByConversation.set(message.conversation_id, arr);
  }

  const readMap = new Map(
    (readsRes.data ?? []).map((r) => [r.conversation_id, r.last_read_at]),
  );

  const toParticipant = (id: string): ContextualParticipantSummary => {
    const profile = profilesById.get(id);
    return {
      id,
      displayName: profile?.display_name ?? null,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  };

  return conversations
    .map((conversation): ContextualConversationSummary => {
      const starterId = conversation.starter_id;
      const recipientId = conversation.recipient_id;
      const otherId = normalizedUserId === starterId ? recipientId : starterId;
      const conversationMessages = messagesByConversation.get(conversation.id) ?? [];
      const latest = conversationMessages[0];
      const lastReadAt = readMap.get(conversation.id);

      const unreadCount = conversationMessages.filter(
        (m) => m.sender_id !== normalizedUserId && (!lastReadAt || m.created_at > lastReadAt),
      ).length;

      return {
        conversationId: conversation.id,
        contextType: 'story_reply',
        contextEntityId: conversation.context_entity_id,
        otherParticipant: toParticipant(otherId),
        latestMessage: latest
          ? { id: latest.id, body: latest.body, senderId: latest.sender_id, createdAt: latest.created_at }
          : null,
        unreadCount,
        lastActivityAt:
          latest?.created_at ?? conversation.updated_at ?? conversation.created_at ?? new Date(0).toISOString(),
      };
    })
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

export async function fetchContextualThreadById(input: {
  conversationId: string;
  currentUserId: string;
}): Promise<ContextualThreadResult> {
  const conversationId = input.conversationId.trim();
  const currentUserId = input.currentUserId.trim();
  if (!conversationId || !currentUserId) return { ok: false, reason: 'not_found' };

  const { data: conversation, error } = await supabase
    .from('contextual_conversations')
    .select('id, context_type, context_entity_id, starter_id, recipient_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (conversation.starter_id !== currentUserId && conversation.recipient_id !== currentUserId) {
    return { ok: false, reason: 'unauthorized' };
  }

  const [profilesRes, messagesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', [conversation.starter_id, conversation.recipient_id]),
    supabase
      .from('contextual_messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const profilesById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const otherId =
    currentUserId === conversation.starter_id
      ? conversation.recipient_id
      : conversation.starter_id;
  const other = profilesById.get(otherId);

  return {
    ok: true,
    thread: {
      id: conversation.id,
      contextType: 'story_reply',
      contextEntityId: conversation.context_entity_id,
      starterId: conversation.starter_id,
      recipientId: conversation.recipient_id,
      otherParticipant: {
        id: otherId,
        displayName: other?.display_name ?? null,
        username: other?.username ?? null,
        avatarUrl: other?.avatar_url ?? null,
      },
      messages: (messagesRes.data ?? []).map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        body: m.body,
        createdAt: m.created_at,
      })),
    },
  };
}

export async function sendContextualMessageFromMobile(input: {
  conversationId: string;
  currentUserId: string;
  body: string;
}): Promise<SendContextualMessageResult> {
  const conversationId = input.conversationId.trim();
  const currentUserId = input.currentUserId.trim();
  const body = input.body.trim();

  if (!body) return { ok: false, reason: 'invalid_body', message: 'اكتب رسالة الأول.' };
  if (body.length > 800) {
    return { ok: false, reason: 'invalid_body', message: 'الرسالة طويلة زيادة عن الحد (800 حرف).' };
  }

  const { data, error } = await supabase
    .from('contextual_messages')
    .insert({ conversation_id: conversationId, sender_id: currentUserId, body })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();

  if (error || !data) {
    if (__DEV__) {
      console.warn('[contextual-conversations] send message failed', error);
    }
    return { ok: false, reason: 'send_failed', message: 'تعذر إرسال الرسالة حالياً.' };
  }

  void notifyContextualMessageFromMobile({
    conversationId,
    messageId: data.id,
    kind: 'thread_message',
  });

  return {
    ok: true,
    message: {
      id: data.id,
      conversationId: data.conversation_id,
      senderId: data.sender_id,
      body: data.body,
      createdAt: data.created_at,
    },
  };
}
