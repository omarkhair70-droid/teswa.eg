import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { AccountProfile, fetchMyAccountProfile } from '@/lib/profiles';
import { getNotificationPermissionStatus, hasStoredPushToken, requestAndRegisterPushDevice } from '@/lib/push-notifications';
import { useUnreadBadges } from '@/lib/unread-badges';

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

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return null;
    const date = new Date(profile.created_at);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
  }, [profile?.created_at]);

  const displayName = profile?.display_name?.trim() || 'مستخدم تِسوى';
  const location = [profile?.city, profile?.area].filter(Boolean).join(' - ');

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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
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
            {profile?.cover_url ? (
              <ExpoImage source={{ uri: profile.cover_url }} style={styles.cover} contentFit="cover" transition={200} cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}><AppText muted>لا توجد صورة غلاف</AppText></View>
            )}

            <AppCard>
              <View style={styles.headerCard}>
                {profile?.avatar_url ? (
                  <ExpoImage source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}><AppText weight="bold">{displayName[0]}</AppText></View>
                )}
                <View style={styles.headerInfo}>
                  <AppText weight="bold" style={styles.name}>{displayName}</AppText>
                  {profile?.username ? <AppText muted>@{profile.username}</AppText> : null}
                  {profile?.profile_tagline ? <AppText muted>{profile.profile_tagline}</AppText> : null}
                  {location ? <AppText muted>{location}</AppText> : null}
                  {memberSince ? <AppText muted>عضو منذ {memberSince}</AppText> : null}
                </View>
              </View>
              {user?.id ? (
                <View style={styles.publicProfileAction}>
                  <AppButton label="عرض ملفي العام" variant="neutral" onPress={() => router.push(`/profile/${user.id}`)} />
                </View>
              ) : null}
            </AppCard>

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
  cover: { width: '100%', height: 180, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  coverFallback: { justifyContent: 'center', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed' },
  headerCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  headerInfo: { flex: 1, gap: spacing.xs },
  name: { fontSize: 22 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', borderColor: colors.border, borderWidth: 1 },
  group: { gap: spacing.sm },
  publicProfileAction: { marginTop: spacing.md },
  errorText: { color: '#B00020' },
});
