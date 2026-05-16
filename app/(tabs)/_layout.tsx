import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUnreadBadges } from '@/lib/unread-badges';

function formatBadge(count: number) {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : count;
}

export default function TabsLayout() {
  const { notificationsUnreadCount, messagesUnreadCount } = useUnreadBadges();

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted }}>
      <Tabs.Screen name="home" options={{ title: 'الرئيسية', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="discover" options={{ title: 'اكتشف', tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="add" options={{ title: 'أضف', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size + 4} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'الرسائل', tabBarBadge: formatBadge(messagesUnreadCount), tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'حسابي', tabBarBadge: formatBadge(notificationsUnreadCount), tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
