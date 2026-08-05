import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/colors';
import { useUnreadBadges } from '@/lib/unread-badges';

function formatBadge(count: number) {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : count;
}

function AddTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.addHalo, focused && styles.addHaloFocused]}>
      <View style={[styles.addCircle, focused && styles.addCircleFocused]}>
        <Ionicons name="add" color={colors.white} size={29} />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { notificationsUnreadCount, messagesUnreadCount } = useUnreadBadges();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size - 1} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'اكتشف',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} color={color} size={size - 1} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'أضف',
          tabBarIcon: ({ focused }) => <AddTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'الرسائل',
          tabBarBadge: formatBadge(messagesUnreadCount),
          tabBarBadgeStyle: styles.messageBadge,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              color={color}
              size={size - 1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          tabBarBadge: notificationsUnreadCount > 0 ? '' : undefined,
          tabBarBadgeStyle: styles.notificationDot,
          tabBarAccessibilityLabel: notificationsUnreadCount > 0
            ? `حسابي، لديك ${notificationsUnreadCount} إشعار غير مقروء`
            : 'حسابي',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.profileIconWrap}>
              <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size - 1} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 76,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderTopColor: 'rgba(116,106,97,0.12)',
    borderTopWidth: 1,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    elevation: 13,
    shadowColor: '#1D1A16',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    overflow: 'visible',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  tabBarItem: {
    gap: 1,
    overflow: 'visible',
  },
  addHalo: {
    width: 58,
    height: 58,
    marginTop: -23,
    borderRadius: 29,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.12)',
    shadowColor: '#7C3A24',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addHaloFocused: {
    borderColor: 'rgba(184,98,63,0.27)',
  },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  addCircleFocused: {
    transform: [{ scale: 1.04 }],
  },
  profileIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    bottom: -8,
    backgroundColor: colors.primary,
  },
  messageBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: colors.primary,
  },
  notificationDot: {
    minWidth: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    fontSize: 0,
    paddingHorizontal: 0,
  },
});
