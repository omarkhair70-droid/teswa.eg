import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { ProfileLivingHero } from '@/components/profile/ProfileLivingHero';
import { ProfilePresenceSignals } from '@/components/profile/ProfilePresenceSignals';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { authenticateTeswaAppLock, BiometricCapabilityState, getBiometricCapabilityState, readBiometricAppLockEnabled, writeBiometricAppLockEnabled } from '@/lib/biometric-app-lock';
import { AccountProfile, fetchMyAccountProfile } from '@/lib/profiles';
import { getNotificationPermissionStatus, hasStoredPushToken, requestAndRegisterPushDevice } from '@/lib/push-notifications';
import { fetchActiveStoriesByUserId } from '@/lib/stories';
import { useUnreadBadges } from '@/lib/unread-badges';
import { buildProfilePresence } from '@/lib/profile-presence';
import { requestMyAccountDeletion } from '@/lib/account-deletion';

const PROFILE_ERROR_MESSAGE = 'تعذر تحميل بيانات الحساب حالياً. حاول مرة تانية.';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [accountDeletionError, setAccountDeletionError] = useState<string | null>(null);
  const [accountDeletionNotice, setAccountDeletionNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const { notificationsUnreadCount } = useUnreadBadges();
  const [pushState, setPushState] = useState<'idle' | 'enabled' | 'denied' | 'error'>('idle');
  const [enablingPush, setEnablingPush] = useState(false);
  const [myActiveStoriesCount, setMyActiveStoriesCount] = useState(0);
  const [myStoriesLoading, setMyStoriesLoading] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapabilityState | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState<string | null>(null);

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

  const capabilityMessage = useMemo(() => {
    if (!biometricCapability) return null;
    if (biometricCapability.status === 'available') {
      const labels = biometricCapability.supportedLabels.join('، ');
      return labels ? `الجهاز جاهز: ${labels}` : 'الجهاز جاهز للتحقق البيومتري.';
    }
    if (biometricCapability.status === 'no_hardware') return 'هذا الجهاز لا يدعم التحقق البيومتري المتاح لقفل التطبيق.';
    if (biometricCapability.status === 'not_enrolled') return 'سجّل بصمة أو تعرفًا على الوجه من إعدادات الهاتف أولاً.';
    return 'تعذر التحقق من جاهزية الحماية الآن.';
  }, [biometricCapability]);

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

  const loadBiometricState = useCallback(async () => {
    if (!user?.id) return;
    setBiometricLoading(true);
    try {
      const [capability, enabled] = await Promise.all([
        getBiometricCapabilityState(),
        readBiometricAppLockEnabled(user.id),
      ]);
      setBiometricCapability(capability);
      setBiometricEnabled(enabled);
    } finally {
      setBiometricLoading(false);
    }
  }, [user?.id]);

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
      void loadBiometricState();
    }, [loadData, loadMyStoriesState, loadBiometricState]),
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

  const handleBiometricAction = async () => {
    if (!user?.id) return;

    if (biometricEnabled) {
      setBiometricBusy(true);
      await writeBiometricAppLockEnabled(user.id, false);
      setBiometricEnabled(false);
      setBiometricMessage('تم إيقاف قفل التطبيق.');
      setBiometricBusy(false);
      return;
    }

    if (biometricCapability?.status !== 'available') {
      setBiometricMessage('الحماية البيومترية غير متاحة الآن على هذا الجهاز.');
      return;
    }

    setBiometricBusy(true);
    const result = await authenticateTeswaAppLock('enable');
    if (result.success) {
      await writeBiometricAppLockEnabled(user.id, true);
      setBiometricEnabled(true);
      setBiometricMessage('تم تفعيل قفل التطبيق على هذا الجهاز.');
    } else {
      setBiometricEnabled(false);
      setBiometricMessage('لم يتم تفعيل القفل. تقدر تحاول مرة تانية.');
    }
    setBiometricBusy(false);
  };


  const handleDeleteAccount = async () => {
    setAccountDeletionError(null);
    setAccountDeletionNotice(null);

    Alert.alert(
      'تأكيد حذف الحساب',
      'حذف الحساب نهائي ولا يمكن التراجع عنه. سيتم حذف حساب تِسوى والبيانات المرتبطة به داخل التطبيق. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'نعم، احذف الحساب',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            const result = await requestMyAccountDeletion();
            if (!result.ok) {
              setAccountDeletionError(result.message);
              setIsDeletingAccount(false);
              return;
            }

            setAccountDeletionNotice(result.message);
            await signOut();
            setIsDeletingAccount(false);
          },
        },
      ],
    );
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

            <AppCard><View style={styles.group}><AppText weight="semibold">نبذة</AppText>{profile?.bio?.trim() ? <AppText>{profile.bio}</AppText> : <AppText muted>لم تضف نبذة بعد.</AppText>}</View></AppCard>
            <AppCard><View style={styles.group}><AppText weight="semibold">الثقة والإحصائيات</AppText><AppText>المقايضات الناجحة: {profile?.successful_swaps_count ?? 0}</AppText><AppText>معدل الرد: {profile?.response_rate != null ? `${profile.response_rate}%` : 'غير متاح بعد'}</AppText></View></AppCard>
            <AppCard><View style={styles.group}><AppText weight="semibold">بيانات الحساب</AppText><AppText>{user?.email ?? 'لا يوجد بريد إلكتروني متاح حالياً.'}</AppText></View></AppCard>

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

            <AppCard>
              <View style={styles.group}>
                <View style={styles.securityTitleRow}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#7C2D12" />
                  <AppText weight="semibold">حماية التطبيق</AppText>
                </View>
                <AppText muted>اقفل تِسوى على هذا الجهاز بالبصمة أو التحقق البيومتري المتاح.</AppText>
                {biometricLoading ? <AppText muted>جاري التحقق من جاهزية الجهاز...</AppText> : null}
                {capabilityMessage ? <AppText muted>{capabilityMessage}</AppText> : null}
                {biometricEnabled ? <AppText style={styles.successText}>قفل التطبيق مفعّل على هذا الجهاز.</AppText> : null}
                {biometricMessage ? <AppText muted>{biometricMessage}</AppText> : null}
                <AppButton
                  label={biometricEnabled ? 'إيقاف القفل' : 'تفعيل القفل بالبصمة'}
                  onPress={handleBiometricAction}
                  disabled={biometricBusy || biometricLoading}
                  variant="neutral"
                />
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
            <AppText weight="semibold" style={styles.dangerTitle}>حذف الحساب نهائيًا</AppText>
            <AppText muted>حذف الحساب يزيل حساب تِسوى والبيانات المرتبطة به داخل التطبيق بشكل نهائي، ولا يمكن التراجع بعد التأكيد.</AppText>
            {accountDeletionError ? <AppText style={styles.errorText}>{accountDeletionError}</AppText> : null}
            {accountDeletionNotice ? <AppText style={styles.successText}>{accountDeletionNotice}</AppText> : null}
            <AppButton
              label={isDeletingAccount ? 'جارٍ حذف الحساب...' : 'حذف الحساب'}
              disabled={isDeletingAccount || isSigningOut}
              onPress={handleDeleteAccount}
              variant="neutral"
            />
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.group}>
            <AppText muted>تقدر تسجل خروجك وتدخل بحساب مختلف وقت ما تحب.</AppText>
            {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}
            <AppButton label={isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'} disabled={isSigningOut} onPress={handleSignOut} variant="neutral" />
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
  securityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  successText: { color: '#7C2D12' },
  dangerTitle: { color: '#B00020' },
});
