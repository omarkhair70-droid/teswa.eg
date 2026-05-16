import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
import { supabase } from '@/lib/supabase/client';

type Ctx = { notificationsUnreadCount: number; messagesUnreadCount: number; refreshBadges: () => Promise<void> };
const UnreadBadgesContext = createContext<Ctx | null>(null);

export function UnreadBadgesProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [messagesUnreadCount, setMessagesUnreadCount] = useState(0);

  const refreshBadges = useCallback(async () => {
    if (!user?.id) return;
    const [notif, messages] = await Promise.all([
      fetchUnreadNotificationCount(user.id),
      supabase.rpc('get_unread_deal_messages_count'),
    ]);
    setNotificationsUnreadCount(notif.ok ? notif.count : 0);
    setMessagesUnreadCount(typeof messages.data === 'number' ? messages.data : 0);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotificationsUnreadCount(0);
      setMessagesUnreadCount(0);
      return;
    }
    void refreshBadges();
  }, [refreshBadges, user?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user?.id) void refreshBadges();
    });
    return () => sub.remove();
  }, [refreshBadges, user?.id]);

  const value = useMemo(() => ({ notificationsUnreadCount, messagesUnreadCount, refreshBadges }), [messagesUnreadCount, notificationsUnreadCount, refreshBadges]);
  return <UnreadBadgesContext.Provider value={value}>{children}</UnreadBadgesContext.Provider>;
}

export function useUnreadBadges() {
  const ctx = useContext(UnreadBadgesContext);
  if (!ctx) throw new Error('useUnreadBadges must be used inside UnreadBadgesProvider');
  return ctx;
}
