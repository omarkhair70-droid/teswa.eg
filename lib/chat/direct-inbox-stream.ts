import type { DirectConversationSummary } from '@/lib/direct-messages';
import { supabase } from '@/lib/supabase/client';

function getConversationSortTimestamp(item: DirectConversationSummary): number {
  const timestamp = item.lastMessageAt ? Date.parse(item.lastMessageAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function formatConversationListTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const differenceInDays = Math.round((todayStart.getTime() - dateStart.getTime()) / (24 * 60 * 60 * 1000));

  if (differenceInDays === 0) {
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }
  if (differenceInDays === 1) return 'أمس';
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

// Compatibility name retained while callers are migrated. Supabase direct_messages
// is now the source of truth for preview, timestamp and unread state.
export async function mergeDirectConversationStreamActivity(
  rows: DirectConversationSummary[],
  _currentUserId: string,
): Promise<DirectConversationSummary[]> {
  return [...rows].sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a));
}

// Compatibility name retained while callers are migrated. Realtime updates now
// come directly from the first-party direct_messages table.
export async function subscribeToDirectInboxStreamUpdates(onUpdate: () => void): Promise<() => void> {
  const channel = supabase
    .channel(`direct-inbox-native:${Date.now()}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, onUpdate)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
