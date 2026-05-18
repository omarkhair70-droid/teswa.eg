import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { ProfileLivingHero } from '@/components/profile/ProfileLivingHero';
import { ProfilePresenceSignals } from '@/components/profile/ProfilePresenceSignals';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { AccountProfile, fetchMyAccountProfile } from '@/lib/profiles';
import { getNotificationPermissionStatus, hasStoredPushToken, requestAndRegisterPushDevice } from '@/lib/push-notifications';
import { fetchActiveStoriesByUserId } from '@/lib/stories';
import { useUnreadBadges } from '@/lib/unread-badges';
import { buildProfilePresence } from '@/lib/profile-presence';

const PROFILE_ERROR_MESSAGE = 'تعذر تحميل بيانات الحساب حالياً. حاول مرة تانية.';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const { notificationsUnreadCount } = useUnreadBadges();
  const [pushState, setPushState] = useState<'idle' | 'enabled' | 'denied' | 'error'>('idle');
  const [enablingPush, setEnablingPush] = useState(false);
  const [myActiveStoriesCount, setMyActiveStoriesCount] = useState(0);
  const [myStoriesLoading, setMyStoriesLoading] = useState(false);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return null;
    const date = new Date(profile.created_at);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
  }, [profile?.created_at]);

  const displayName = profile?.display_name?.trim() || 'مستخدم تِسوى';
  const location = [profile?.city, profile?.area].filter(Boolean).join(' - ');
  const profilePresence = useMemo(
    () => buildProfilePresence({
      activeStoriesCount: myActiveStoriesCount,
      successfulSwapsCount: profile?.successful_swaps_count ?? 0,
      responseRate: profile?.response_rate ?? null,
      variant: 'self',
    }),
    [myActiveStoriesCount, profile?.response_rate, profile?.successful_swaps_count],
  );

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const profileData = await fetchMyAccountProfile(user.id);
      setProfile(profileData);
    } catch (e) {
      if (__DEV__) console.log('[Profile] load failed', e);
      setError(PROFILE_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMyStoriesState = useCallback(async () => {
    if (!user?.id) {
      setMyActiveStoriesCount(0);
      return;
    }

    setMyStoriesLoading(true);
    try {
      const activeStories = await fetchActiveStoriesByUserId(user.id);
      setMyActiveStoriesCount(activeStories.length);
    } catch (e) {
      if (__DEV__) console.log('[Profile] my stories load failed', e);
      setMyActiveStoriesCount(0);
    } finally {
      setMyStoriesLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadMyStoriesState();
    }, [loadData, loadMyStoriesState]),
  );

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const hydratePushState = async () => {
      try {
        const status = await getNotificationPermissionStatus();
        if (!active) return;
        if (status !== 'granted') {
          setPushState('idle');
          return;
        }

        const storedTokenExists = await hasStoredPushToken();
        if (!active) return;
        setPushState(storedTokenExists ? 'enabled' : 'idle');
      } catch {
        if (!active) return;
        setPushState('idle');
      }
    };

    void hydratePushState();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleEnablePush = async () => {
    if (!user?.id) return;
    setEnablingPush(true);
    try {
      const result = await requestAndRegisterPushDevice(user.id);
      if (result.ok) setPushState('enabled');
      else if (result.reason === 'permission_denied') setPushState('denied');
      else setPushState('error');
    } catch {
      setPushState('error');
    } finally {
      setEnablingPush(false);
    }
  };

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
            <ProfileLivingHero
              coverUrl={profile?.cover_url ?? null}
              avatarUrl={profile?.avatar_url ?? null}
              displayName={displayName}
              username={profile?.username ?? null}
              tagline={profile?.profile_tagline ?? null}
              location={location || null}
              memberSince={memberSince}
              activeStoriesCount={myActiveStoriesCount}
              onOpenStories={user?.id && myActiveStoriesCount > 0 ? () => router.push(`/story/${user.id}`) : null}
              variant="self"
            />

            <ProfilePresenceSignals presence={profilePresence} />

            {user?.id ? (
              <AppCard>
                <View style={styles.publicProfileAction}>
                  <AppButton label="تعديل ملفي" variant="neutral" onPress={() => router.push('/profile/edit')} />
                  <AppButton label="عرض ملفي العام" variant="neutral" onPress={() => router.push(`/profile/${user.id}`)} />
                  {myActiveStoriesCount > 0 ? (
                    <AppButton label="عرض قصصي" variant="neutral" onPress={() => router.push(`/story/${user.id}`)} />
                  ) : null}
                  <AppButton label="إضافة قصة" variant="neutral" onPress={() => router.push('/story/create')} />
                  <AppButton label="إدارة قصصي" variant="neutral" onPress={() => router.push('/story/manage')} />
                  <AppButton label="إدارة عناصري" variant="neutral" onPress={() => router.push('/item/manage')} />
                  {!myStoriesLoading && myActiveStoriesCount > 0 ? <AppText muted>لديك {myActiveStoriesCount} قصة نشطة الآن</AppText> : null}
                </View>
              </AppCard>
            ) : null}

            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">نبذة</AppText>
                {profile?.bio?.trim() ? <AppText>{profile.bio}</AppText> : <AppText muted>لم تضف نبذة بعد.</AppText>}
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">الثقة والإحصائيات</AppText>
                <AppText>المقايضات الناجحة: {profile?.successful_swaps_count ?? 0}</AppText>
                <AppText>معدل الرد: {profile?.response_rate != null ? `${profile.response_rate}%` : 'غير متاح بعد'}</AppText>
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">بيانات الحساب</AppText>
                <AppText>{user?.email ?? 'لا يوجد بريد إلكتروني متاح حالياً.'}</AppText>
              </View>
            </AppCard>

            <AppCard>
              <View style={styles.group}>
                <AppText weight="semibold">إشعارات الموبايل</AppText>
                {pushState !== 'enabled' ? <AppText muted>فعّل إشعارات الموبايل علشان يوصلك تنبيه عند العروض والرسائل المهمة.</AppText> : null}
                {pushState === 'enabled' ? <AppText muted>تم تفعيل إشعارات الموبايل لهذا الجهاز.</AppText> : null}
                {pushState === 'denied' ? <AppText muted>لم يتم منح إذن الإشعارات. تقدر تفعّله لاحقًا من إعدادات الهاتف.</AppText> : null}
                {pushState === 'error' ? <AppText muted>تعذر تفعيل الإشعارات حالياً. حاول مرة تانية.</AppText> : null}
                {pushState !== 'enabled' ? <AppButton label={enablingPush ? 'جاري التفعيل...' : 'تفعيل إشعارات الموبايل'} disabled={enablingPush} onPress={handleEnablePush} variant="neutral" /> : null}
              </View>
            </AppCard>

            <Pressable onPress={() => router.push('/notifications')}>
              <AppCard>
                <View style={styles.group}>
                  <AppText weight="semibold">الإشعارات</AppText>
                  <AppText muted>{notificationsUnreadCount > 0 ? `لديك ${notificationsUnreadCount} إشعارات جديدة` : 'لا توجد إشعارات جديدة'}</AppText>
                </View>
              </AppCard>
            </Pressable>
          </>
        ) : null}

        <AppCard>
          <View style={styles.group}>
            <AppText muted>تقدر تسجل خروجك وتدخل بحساب مختلف وقت ما تحب.</AppText>
            {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}
            <AppButton
              label={isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
              disabled={isSigningOut}
              onPress={handleSignOut}
              variant="neutral"
            />
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 24 },
  group: { gap: spacing.sm },
  publicProfileAction: { marginTop: spacing.md, gap: spacing.sm },
  errorText: { color: '#B00020' },
});
