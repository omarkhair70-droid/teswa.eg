import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
import { AccountProfile, fetchMyAccountProfile } from '@/lib/profiles';

const PROFILE_ERROR_MESSAGE = 'تعذر تحميل بيانات الحساب حالياً. حاول مرة تانية.';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [profileData, unreadResult] = await Promise.all([
        fetchMyAccountProfile(user.id),
        fetchUnreadNotificationCount(user.id),
      ]);
      setProfile(profileData);
      setUnreadCount(unreadResult.ok ? unreadResult.count : 0);
    } catch (e) {
      if (__DEV__) console.log('[Profile] load failed', e);
      setError(PROFILE_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    if (!result.ok) setSignOutError(result.message);
    setIsSigningOut(false);
  };

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>حسابي</AppText>

        {loading ? <AppText muted>جاري تحميل بيانات الحساب...</AppText> : null}
        {!loading && error ? <AppCard><View style={styles.group}><AppText>{error}</AppText><AppButton label="إعادة المحاولة" onPress={loadData} variant="neutral" /></View></AppCard> : null}

        {!loading && !error ? (
          <>
            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">{profile?.display_name?.trim() || 'مستخدم تِسوى'}</AppText>
                {profile?.username ? <AppText muted>@{profile.username}</AppText> : null}
                <AppText>{user?.email ?? 'لا يوجد بريد إلكتروني متاح حالياً.'}</AppText>
                {profile?.profile_tagline ? <AppText muted>{profile.profile_tagline}</AppText> : null}
                {(profile?.city || profile?.area) ? <AppText muted>{[profile.city, profile.area].filter(Boolean).join(' - ')}</AppText> : null}
                {profile?.bio ? <AppText>{profile.bio}</AppText> : null}
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">الثقة والإحصائيات</AppText>
                <AppText>المقايضات الناجحة: {profile?.successful_swaps_count ?? 0}</AppText>
                <AppText>معدل الرد: {profile?.response_rate != null ? `${profile.response_rate}%` : 'غير متاح بعد'}</AppText>
              </View>
            </AppCard>

            <Pressable onPress={() => router.push('/notifications')}>
              <AppCard>
                <View style={styles.group}>
                  <AppText weight="semibold">الإشعارات</AppText>
                  <AppText muted>{unreadCount > 0 ? `لديك ${unreadCount} إشعارات جديدة` : 'لا توجد إشعارات جديدة'}</AppText>
                </View>
              </AppCard>
            </Pressable>
          </>
        ) : null}

        <AppText muted>تقدر تسجل خروجك وتدخل بحساب مختلف وقت ما تحب.</AppText>
        {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}
        <AppButton
          label={isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
          disabled={isSigningOut}
          onPress={handleSignOut}
          variant="neutral"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 24 },
  group: { gap: spacing.xs },
  errorText: { color: '#B00020' },
});
