import { supabase } from '@/lib/supabase/client';

export type ContextualConversationType = 'story_reply';

export type ContextualConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export async function markContextualThreadReadFromMobile(
  conversationId: string,
): Promise<void> {
  const normalizedConversationId = conversationId.trim();

  if (!normalizedConversationId) {
    return;
  }

  const { error } = await supabase.rpc('mark_contextual_thread_read', {
    p_conversation_id: normalizedConversationId,
  });

  if (error && __DEV__) {
    console.warn('[contextual-conversations] mark read failed', error);
  }
}

export async function fetchUnreadContextualMessagesCount(): Promise<number> {
  const { data, error } = await supabase.rpc(
    'get_unread_contextual_messages_count',
  );

  if (error) {
    if (__DEV__) {
      console.warn('[contextual-conversations] unread count failed', error);
    }
    return 0;
  }

  return typeof data === 'number' ? Math.max(0, data) : 0;
}
