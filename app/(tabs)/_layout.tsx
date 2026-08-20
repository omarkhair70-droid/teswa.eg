import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUnreadBadges } from '@/lib/unread-badges';
import { useTeswaColors } from '@/lib/theme/use-teswa-theme';

function formatBadge(count: number) {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : count;
}

export default function TabsLayout() {
  const colors = useTeswaColors();
  const { notificationsUnreadCount, messagesUnreadCount } = useUnreadBadges();
  const messageBadge = {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    fontSize: 10,
    fontWeight: '700' as const,
    backgroundColor: colors.primary,
    color: colors.white,
  };
  const notificationDot = {
    minWidth: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    fontSize: 0,
    paddingHorizontal: 0,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: 5,
          elevation: 8,
          shadowColor: colors.shadow,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { gap: 1 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'الرئيسية', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size - 1} /> }} />
      <Tabs.Screen name="discover" options={{ title: 'اكتشف', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'compass' : 'compass-outline'} color={color} size={size - 1} /> }} />
      <Tabs.Screen name="add" options={{ title: 'أضف', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size + 3} /> }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'الرسائل',
          tabBarBadge: formatBadge(messagesUnreadCount),
          tabBarBadgeStyle: messageBadge,
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} color={color} size={size - 1} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          tabBarBadge: notificationsUnreadCount > 0 ? '' : undefined,
          tabBarBadgeStyle: notificationDot,
          tabBarAccessibilityLabel: notificationsUnreadCount > 0 ? `حسابي، لديك ${notificationsUnreadCount} إشعار غير مقروء` : 'حسابي',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size - 1} />,
        }}
      />
    </Tabs>
  );
}
