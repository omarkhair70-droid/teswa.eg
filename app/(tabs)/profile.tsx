import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { ProfileLivingHero } from '@/components/profile/ProfileLivingHero';
import { ProfilePresenceSignals } from '@/components/profile/ProfilePresenceSignals';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { authenticateTeswaAppLock, BiometricCapabilityState, getBiometricCapabilityState, readBiometricAppLockEnabled, writeBiometricAppLockEnabled } from '@/lib/biometric-app-lock';
import { AccountProfile, fetchMyAccountProfile } from '@/lib/profiles';
import { getNotificationPermissionStatus, hasStoredPushToken, requestAndRegisterPushDevice } from '@/lib/push-notifications';
import { fetchActiveStoriesByUserId } from '@/lib/stories';
import { useUnreadBadges } from '@/lib/unread-badges';
import { buildProfilePresence } from '@/lib/profile-presence';
import { requestMyAccountDeletion } from '@/lib/account-deletion';
import { fetchUserFollowState } from '@/lib/user-follows';
import { removeProfileImageFromMobile, replaceProfileImageFromMobile } from '@/lib/profile-images';

const PROFILE_ERROR_MESSAGE = 'تعذر تحميل بيانات الحساب حالياً. حاول مرة تانية.';

type AccountIconName = keyof typeof Ionicons.glyphMap;
type AccountIconTone = 'primary' | 'accent' | 'success' | 'danger';

const iconToneStyles: Record<AccountIconTone, { backgroundColor: string; color: string }> = {
  primary: { backgroundColor: colors.primarySoft, color: colors.primary },
  accent: { backgroundColor: colors.accentSoft, color: colors.accent },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
};

function ProfileLoadingState() {
  return (
    <View style={styles.loadingStack} accessibilityLabel="جاري تحميل بيانات الحساب">
      <View style={styles.loadingHero}>
        <View style={styles.loadingCover} />
        <View style={styles.loadingIdentityRow}>
          <View style={styles.loadingAvatar} />
          <View style={styles.loadingCopy}>
            <View style={styles.loadingTitle} />
            <View style={styles.loadingLineSmall} />
          </View>
        </View>
      </View>
      <View style={styles.loadingActions}>
        <View style={styles.loadingAction} />
        <View style={styles.loadingAction} />
      </View>
      <View style={styles.loadingCard} />
      <View style={styles.loadingCardCompact} />
    </View>
  );
}

function AccountSectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <AppText weight="semibold" style={styles.sectionEyebrow}>{eyebrow}</AppText>
      <AppText weight="bold" style={styles.sectionTitle}>{title}</AppText>
      <AppText muted style={styles.sectionDescription}>{description}</AppText>
    </View>
  );
}

function AccountNavigationRow({
  icon,
  title,
  description,
  onPress,
  badge,
  tone = 'primary',
  last = false,
}: {
  icon: AccountIconName;
  title: string;
  description?: string;
  onPress: () => void;
  badge?: string | null;
  tone?: AccountIconTone;
  last?: boolean;
}) {
  const toneStyle = iconToneStyles[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}، ${description}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.navigationRow, last && styles.navigationRowLast, pressed && styles.pressedRow]}
    >
      <View style={[styles.navigationIcon, { backgroundColor: toneStyle.backgroundColor }]}>
        <Ionicons name={icon} size={19} color={toneStyle.color} />
      </View>
      <View style={styles.navigationCopy}>
        <View style={styles.navigationTitleRow}>
          <AppText weight="semibold" style={styles.navigationTitle}>{title}</AppText>
          {badge ? (
            <View style={styles.navigationBadge}>
              <AppText weight="bold" style={styles.navigationBadgeText}>{badge}</AppText>
            </View>
          ) : null}
        </View>
        {description ? <AppText muted style={styles.navigationDescription}>{description}</AppText> : null}
      </View>
      <View style={styles.navigationArrow}>
        <Ionicons name="chevron-back-outline" size={17} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function AccountQuickAction({
  icon,
  title,
  description,
  onPress,
  tone = 'primary',
}: {
  icon: AccountIconName;
  title: string;
  description: string;
  onPress: () => void;
  tone?: AccountIconTone;
}) {
  const toneStyle = iconToneStyles[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}، ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: toneStyle.backgroundColor }]}>
        <Ionicons name={icon} size={20} color={toneStyle.color} />
      </View>
      <AppText weight="bold" style={styles.quickActionTitle}>{title}</AppText>
      <AppText muted style={styles.quickActionDescription}>{description}</AppText>
      <Ionicons name="arrow-back-outline" size={16} color={toneStyle.color} style={styles.quickActionArrow} />
    </Pressable>
  );
}

function formatMemberSince(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const userId = user?.id ?? null;
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
  const [followCounts, setFollowCounts] = useState({ followerCount: 0, followingCount: 0 });
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);

  const memberSince = formatMemberSince(profile?.created_at);

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
    if (!userId) return;
    setBiometricLoading(true);
    try {
      const [capability, enabled] = await Promise.all([
        getBiometricCapabilityState(),
        readBiometricAppLockEnabled(userId),
      ]);
      setBiometricCapability(capability);
      setBiometricEnabled(enabled);
    } finally {
      setBiometricLoading(false);
    }
  }, [userId]);

  const loadMyStoriesState = useCallback(async () => {
    if (!userId) {
      setMyActiveStoriesCount(0);
      return;
    }

    setMyStoriesLoading(true);
    try {
      const activeStories = await fetchActiveStoriesByUserId(userId);
      setMyActiveStoriesCount(activeStories.length);
    } catch (e) {
      if (__DEV__) console.log('[Profile] my stories load failed', e);
      setMyActiveStoriesCount(0);
    } finally {
      setMyStoriesLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      if (userId) fetchUserFollowState(userId, userId).then((r) => { if (r.ok) setFollowCounts({ followerCount: r.state.followerCount, followingCount: r.state.followingCount }); });
      loadMyStoriesState();
      void loadBiometricState();
    }, [loadBiometricState, loadData, loadMyStoriesState, userId]),
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

  const handlePickAvatar = async (source: 'camera' | 'gallery') => {
    if (!user?.id) return;
    const permissionResult = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setError('لا يمكن تحديث الصورة بدون إذن الوصول للكاميرا/المعرض.');
      return;
    }
    const pickerResult = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (pickerResult.canceled || !pickerResult.assets[0]) return;
    const result = await replaceProfileImageFromMobile({ userId: user.id, kind: 'avatar', asset: pickerResult.assets[0], previousImageUrl: profile?.avatar_url ?? null });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAvatarSheetOpen(false);
    await loadData();
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;
    const result = await removeProfileImageFromMobile({ userId: user.id, kind: 'avatar', currentImageUrl: profile?.avatar_url ?? null });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAvatarSheetOpen(false);
    await loadData();
  };

  return (
    <AppScreen scrollable backgroundVariant="alive" style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.screenHeader}>
          <View style={styles.screenHeaderCopy}>
            <AppText weight="semibold" style={styles.screenEyebrow}>مساحتك في تِسوى</AppText>
            <AppText weight="bold" style={styles.title}>حسابي</AppText>
            <AppText muted style={styles.screenSubtitle}>هويتك، حضورك، وكل أدواتك في مكان واحد.</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح الإعدادات"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          >
            <Ionicons name="settings-outline" size={21} color={colors.primary} />
          </Pressable>
        </View>

        {loading ? <ProfileLoadingState /> : null}
        {!loading && error ? (
          <AppCard variant="outlined" style={styles.errorCard}>
            <View style={styles.errorIconShell}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.errorCopy}>
              <AppText weight="bold" style={styles.errorTitle}>تعذر تحميل حسابك</AppText>
              <AppText muted style={styles.errorDescription}>{error}</AppText>
            </View>
            <AppButton label="إعادة المحاولة" onPress={loadData} variant="neutral" iconName="refresh-outline" />
          </AppCard>
        ) : null}

        {!loading && !error ? (
          <>
            <AppFadeIn delay={0} duration={240} fromY={10}>
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
                onPressAvatarRing={user?.id && myActiveStoriesCount > 0 ? () => router.push(`/story/${user.id}`) : null}
                onPressAvatar={() => setAvatarSheetOpen(true)}
                variant="self"
              />
            </AppFadeIn>

            {user?.id ? (
              <AppFadeIn delay={45} duration={240} fromY={8} style={styles.primaryActions}>
                <View style={styles.primaryActionMain}>
                  <AppButton label="تعديل ملفي" iconName="create-outline" onPress={() => router.push('/profile/edit')} fullWidth />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="عرض ملفي العام"
                  onPress={() => router.push(`/profile/${user.id}`)}
                  style={({ pressed }) => [styles.publicProfileButton, pressed && styles.publicProfileButtonPressed]}
                >
                  <Ionicons name="eye-outline" size={18} color={colors.primary} />
                  <AppText weight="semibold" style={styles.publicProfileButtonText}>عرض عام</AppText>
                </Pressable>
              </AppFadeIn>
            ) : null}

            <AppFadeIn delay={75} duration={240} fromY={8} style={styles.sectionGroup}>
              <AccountSectionHeading
                eyebrow="نبض ملفك"
                title="حضورك في المجتمع"
                description="قصصك، تبديلاتك، ودائرتك في لمحة واحدة."
              />
              <ProfilePresenceSignals presence={profilePresence} />
              {user?.id ? (
                <AppCard padding="sm" style={styles.communityCard}>
                  <View style={styles.followStatsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`المتابعون، ${followCounts.followerCount}`}
                      style={({ pressed }) => [styles.followStatTile, pressed && styles.followStatPressed]}
                      onPress={() => router.push(`/profile-followers/${user.id}`)}
                    >
                      <View style={styles.followStatIcon}>
                        <Ionicons name="people-outline" size={18} color={colors.primary} />
                      </View>
                      <AppText weight="bold" style={styles.followStatValue}>{followCounts.followerCount}</AppText>
                      <AppText muted style={styles.followStatLabel}>المتابعون</AppText>
                    </Pressable>
                    <View style={styles.followDivider} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`يتابع، ${followCounts.followingCount}`}
                      style={({ pressed }) => [styles.followStatTile, pressed && styles.followStatPressed]}
                      onPress={() => router.push(`/profile-following/${user.id}`)}
                    >
                      <View style={[styles.followStatIcon, styles.followStatIconAccent]}>
                        <Ionicons name="person-add-outline" size={18} color={colors.accent} />
                      </View>
                      <AppText weight="bold" style={styles.followStatValue}>{followCounts.followingCount}</AppText>
                      <AppText muted style={styles.followStatLabel}>يتابع</AppText>
                    </Pressable>
                  </View>
                </AppCard>
              ) : null}
            </AppFadeIn>

            {user?.id ? (
              <AppFadeIn delay={125} duration={240} fromY={8} style={styles.sectionGroup}>
                <AccountSectionHeading
                  eyebrow="أدواتك"
                  title="مساحتك الخاصة"
                  description="العناصر، القصص، والمسودات التي تصنع حضورك في تِسوى."
                />
                <View style={styles.quickActionsGrid}>
                  <AccountQuickAction
                    icon="cube-outline"
                    title="عناصري"
                    description="راجع وعدّل المعروض"
                    onPress={() => router.push('/item/manage')}
                  />
                  <AccountQuickAction
                    icon="archive-outline"
                    title="دولابي"
                    description="مسوداتك وميدياك"
                    onPress={() => router.push('/dolab')}
                    tone="accent"
                  />
                  <AccountQuickAction
                    icon="add-circle-outline"
                    title="قصة جديدة"
                    description="شارك لحظة الآن"
                    onPress={() => router.push('/story/create')}
                    tone="success"
                  />
                  <AccountQuickAction
                    icon="albums-outline"
                    title="إدارة القصص"
                    description="رتّب ما شاركته"
                    onPress={() => router.push('/story/manage')}
                  />
                </View>

                {!myStoriesLoading && myActiveStoriesCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`عرض قصصي، لديك ${myActiveStoriesCount} قصة نشطة`}
                    onPress={() => router.push(`/story/${user.id}`)}
                    style={({ pressed }) => [styles.activeStoryBanner, pressed && styles.activeStoryBannerPressed]}
                  >
                    <LinearGradient
                      colors={['rgba(184,98,63,0.14)', 'rgba(245,158,11,0.12)', 'rgba(62,124,115,0.12)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.activeStoryIcon}>
                      <Ionicons name="play-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.activeStoryCopy}>
                      <AppText weight="bold">قصصك حاضرة الآن</AppText>
                      <AppText muted style={styles.activeStoryDescription}>لديك {myActiveStoriesCount} قصة نشطة — شاهدها كما يراها الآخرون.</AppText>
                    </View>
                    <Ionicons name="chevron-back-outline" size={18} color={colors.primary} />
                  </Pressable>
                ) : null}
              </AppFadeIn>
            ) : null}

            <AppFadeIn delay={150} duration={240} fromY={8} style={styles.sectionGroup}>
              <AccountSectionHeading
                eyebrow="عنّك"
                title="تفاصيل ملفك"
                description="المعلومات التي تساعد المجتمع يعرفك ويثق في التواصل معك."
              />
              <AppCard padding="md" style={styles.detailsCard}>
                <View style={styles.detailBlock}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="reader-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.detailCopy}>
                    <AppText weight="semibold">نبذة عنك</AppText>
                    {profile?.bio?.trim() ? (
                      <AppText muted style={styles.detailBody}>{profile.bio}</AppText>
                    ) : (
                      <View style={styles.emptyDetailRow}>
                        <AppText muted style={styles.detailBody}>لم تضف نبذة بعد. سطران صادقان يجعلون ملفك أقرب.</AppText>
                        <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')} hitSlop={spacing.sm}>
                          <AppText weight="semibold" style={styles.inlineAction}>أضف نبذة</AppText>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.detailBlock}>
                  <View style={[styles.detailIcon, styles.detailIconAccent]}>
                    <Ionicons name="mail-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={styles.detailCopy}>
                    <AppText weight="semibold">بريد الحساب</AppText>
                    <AppText muted style={styles.detailBody}>{user?.email ?? 'لا يوجد بريد إلكتروني متاح حالياً.'}</AppText>
                  </View>
                </View>
              </AppCard>
            </AppFadeIn>

            <AppFadeIn delay={175} duration={240} fromY={8} style={styles.sectionGroup}>
              <AccountSectionHeading
                eyebrow="التحكم"
                title="إشعاراتك"
                description="تحكم في التنبيهات وافتح الجديد من مكان واحد."
              />
              <AppCard padding="sm" style={styles.navigationCard}>
                <AccountNavigationRow
                  icon="options-outline"
                  title="تفضيلات الإشعارات"
                  description="أنواع التنبيهات ووضع الهدوء."
                  onPress={() => router.push('/settings/notifications')}
                  tone="accent"
                />
                <AccountNavigationRow
                  icon="notifications-outline"
                  title="مركز الإشعارات"
                  description={notificationsUnreadCount > 0 ? `لديك ${notificationsUnreadCount} إشعارات جديدة` : 'كل شيء هادئ حتى الآن.'}
                  badge={notificationsUnreadCount > 0 ? String(notificationsUnreadCount) : null}
                  onPress={() => router.push('/notifications')}
                  tone="success"
                  last
                />
              </AppCard>
            </AppFadeIn>

            <AppFadeIn delay={200} duration={240} fromY={8} style={styles.sectionGroup}>
              <AccountSectionHeading
                eyebrow="الأمان والتواصل"
                title="جاهزية حسابك"
                description="فعّل ما تحتاجه على هذا الجهاز واترك الباقي لوقته."
              />
              <AppCard padding="md" style={styles.readinessCard}>
                <View style={styles.readinessFeature}>
                  <View style={[styles.readinessIcon, pushState === 'enabled' && styles.readinessIconSuccess]}>
                    <Ionicons name={pushState === 'enabled' ? 'notifications' : 'notifications-outline'} size={20} color={pushState === 'enabled' ? colors.success : colors.primary} />
                  </View>
                  <View style={styles.readinessCopy}>
                    <View style={styles.readinessTitleRow}>
                      <AppText weight="bold">إشعارات الموبايل</AppText>
                      <View style={[styles.statusPill, pushState === 'enabled' && styles.statusPillSuccess]}>
                        <AppText weight="semibold" style={[styles.statusPillText, pushState === 'enabled' && styles.statusPillTextSuccess]}>
                          {pushState === 'enabled' ? 'مفعّلة' : 'غير مفعّلة'}
                        </AppText>
                      </View>
                    </View>
                    {pushState === 'enabled' ? <AppText muted style={styles.readinessDescription}>التنبيهات المهمة ستصل إلى هذا الجهاز.</AppText> : null}
                    {pushState === 'idle' ? <AppText muted style={styles.readinessDescription}>فعّلها لتعرف بالعروض والرسائل المهمة وقتها.</AppText> : null}
                    {pushState === 'denied' ? <AppText muted style={styles.readinessDescription}>الإذن مرفوض حاليًا. يمكنك تغييره من إعدادات الهاتف.</AppText> : null}
                    {pushState === 'error' ? <AppText muted style={styles.readinessDescription}>تعذر التفعيل الآن. حاول مرة أخرى.</AppText> : null}
                  </View>
                </View>
                {pushState !== 'enabled' ? (
                  <AppButton
                    label={enablingPush ? 'جاري التفعيل' : 'تفعيل الإشعارات'}
                    loading={enablingPush}
                    onPress={handleEnablePush}
                    variant="neutral"
                    iconName="notifications-outline"
                    fullWidth
                  />
                ) : null}

                <View style={styles.cardDivider} />

                <View style={styles.readinessFeature}>
                  <View style={[styles.readinessIcon, biometricEnabled && styles.readinessIconSuccess]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={biometricEnabled ? colors.success : colors.primary} />
                  </View>
                  <View style={styles.readinessCopy}>
                    <View style={styles.readinessTitleRow}>
                      <AppText weight="bold">حماية التطبيق</AppText>
                      <View style={[styles.statusPill, biometricEnabled && styles.statusPillSuccess]}>
                        <AppText weight="semibold" style={[styles.statusPillText, biometricEnabled && styles.statusPillTextSuccess]}>
                          {biometricEnabled ? 'محمي' : 'اختياري'}
                        </AppText>
                      </View>
                    </View>
                    <AppText muted style={styles.readinessDescription}>اقفل تِسوى بالبصمة أو التحقق المتاح على جهازك.</AppText>
                    {biometricLoading ? <AppText muted style={styles.readinessMeta}>جاري التحقق من جاهزية الجهاز...</AppText> : null}
                    {capabilityMessage ? <AppText muted style={styles.readinessMeta}>{capabilityMessage}</AppText> : null}
                    {biometricMessage ? <AppText style={biometricEnabled ? styles.successText : styles.readinessMeta}>{biometricMessage}</AppText> : null}
                  </View>
                </View>
                <AppButton
                  label={biometricEnabled ? 'إيقاف قفل التطبيق' : 'تفعيل القفل بالبصمة'}
                  onPress={handleBiometricAction}
                  loading={biometricBusy}
                  disabled={biometricLoading}
                  variant="neutral"
                  iconName="finger-print-outline"
                  fullWidth
                />
              </AppCard>
            </AppFadeIn>
          </>
        ) : null}

        <AppFadeIn delay={225} duration={240} fromY={8} style={styles.sectionGroup}>
          <AccountSectionHeading
            eyebrow="الخصوصية"
            title="سياسات تِسوى"
            description="اعرف حقوقك وقواعد المجتمع وخيارات إدارة بياناتك."
          />
          <AppCard padding="sm" style={styles.navigationCard}>
            <AccountNavigationRow icon="lock-closed-outline" title="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
            <AccountNavigationRow icon="document-text-outline" title="شروط الاستخدام" onPress={() => router.push('/legal/terms')} tone="accent" />
            <AccountNavigationRow icon="people-circle-outline" title="إرشادات المجتمع" onPress={() => router.push('/legal/community-guidelines')} tone="success" />
            <AccountNavigationRow
              icon="globe-outline"
              title="طلب حذف الحساب عبر الويب"
              description="مسار بديل لإدارة طلب الحذف."
              onPress={() => router.push('/account-deletion')}
              last
            />
          </AppCard>
        </AppFadeIn>

        <AppFadeIn delay={250} duration={240} fromY={8} style={styles.sectionGroup}>
          <AccountSectionHeading
            eyebrow="الجلسة"
            title="تبديل الحساب"
            description="سجّل خروجك بأمان وارجع بحساب مختلف وقت ما تحب."
          />
          <AppCard padding="md" style={styles.sessionCard}>
            <View style={styles.sessionCopy}>
              <View style={styles.sessionIcon}>
                <Ionicons name="log-out-outline" size={20} color={colors.textMuted} />
              </View>
              <AppText muted style={styles.sessionDescription}>لن يتم حذف أي بيانات عند تسجيل الخروج.</AppText>
            </View>
            {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}
            <AppButton
              label={isSigningOut ? 'جاري تسجيل الخروج' : 'تسجيل الخروج'}
              loading={isSigningOut}
              disabled={isDeletingAccount}
              onPress={handleSignOut}
              variant="neutral"
              iconName="log-out-outline"
              fullWidth
            />
          </AppCard>
        </AppFadeIn>

        <AppFadeIn delay={275} duration={240} fromY={8} style={styles.sectionGroup}>
          <AccountSectionHeading
            eyebrow="منطقة حساسة"
            title="حذف الحساب"
            description="هذا الإجراء نهائي؛ لذلك فصلناه عن بقية إعداداتك."
          />
          <AppCard variant="outlined" padding="md" style={styles.dangerCard}>
            <View style={styles.dangerIntro}>
              <View style={styles.dangerIcon}>
                <Ionicons name="warning-outline" size={20} color={colors.danger} />
              </View>
              <View style={styles.dangerCopy}>
                <AppText weight="bold" style={styles.dangerTitle}>حذف الحساب نهائيًا</AppText>
                <AppText muted style={styles.dangerDescription}>سيتم حذف حساب تِسوى والبيانات المرتبطة به، ولا يمكن التراجع بعد التأكيد.</AppText>
              </View>
            </View>
            {accountDeletionError ? <AppText style={styles.errorText}>{accountDeletionError}</AppText> : null}
            {accountDeletionNotice ? <AppText style={styles.successText}>{accountDeletionNotice}</AppText> : null}
            <AppButton
              label={isDeletingAccount ? 'جارٍ حذف الحساب' : 'حذف الحساب نهائيًا'}
              loading={isDeletingAccount}
              disabled={isSigningOut}
              onPress={handleDeleteAccount}
              variant="danger"
              iconName="trash-outline"
              fullWidth
            />
          </AppCard>
        </AppFadeIn>
      </View>

      <Modal visible={avatarSheetOpen} transparent animationType="fade" onRequestClose={() => setAvatarSheetOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAvatarSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <AppText weight="bold" style={styles.sheetTitle}>صورة الملف</AppText>
              <AppText muted style={styles.sheetDescription}>حدّث صورتك بالطريقة المناسبة لك.</AppText>
            </View>
            {profile?.avatar_url ? <AppButton label="عرض الصورة" variant="neutral" onPress={() => { setAvatarSheetOpen(false); setAvatarViewerOpen(true); }} /> : null}
            {profile?.avatar_url ? <AppButton label="تغيير صورة الملف" variant="neutral" onPress={() => void handlePickAvatar('gallery')} /> : <AppButton label="إضافة صورة الملف" variant="neutral" onPress={() => void handlePickAvatar('gallery')} />}
            <AppButton label="التقاط صورة" variant="neutral" onPress={() => void handlePickAvatar('camera')} />
            {profile?.avatar_url ? <AppButton label="حذف صورة الملف" variant="danger" onPress={() => void handleRemoveAvatar()} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={avatarViewerOpen} transparent animationType="fade" onRequestClose={() => setAvatarViewerOpen(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setAvatarViewerOpen(false)}>
          <View style={styles.viewerClose}>
            <Ionicons name="close-outline" size={24} color={colors.white} />
          </View>
          {profile?.avatar_url ? <ExpoImage source={{ uri: profile.avatar_url }} style={styles.viewerImage} contentFit="contain" /> : <AppText style={styles.viewerFallbackText}>لا توجد صورة ملف لعرضها.</AppText>}
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  screenHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  screenHeaderCopy: { flex: 1, gap: spacing.xs },
  screenEyebrow: { color: colors.primary, fontSize: 12 },
  title: { fontSize: 26, lineHeight: 32 },
  screenSubtitle: { fontSize: 13, lineHeight: 20 },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
  },
  settingsButtonPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  sectionGroup: { gap: spacing.sm },
  sectionHeading: { gap: 3, paddingHorizontal: spacing.xs },
  sectionEyebrow: { color: colors.primary, fontSize: 12 },
  sectionTitle: { fontSize: 19, lineHeight: 25 },
  sectionDescription: { fontSize: 12, lineHeight: 18 },
  primaryActions: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: spacing.sm },
  primaryActionMain: { flex: 1 },
  publicProfileButton: {
    minWidth: 104,
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  publicProfileButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  publicProfileButtonText: { color: colors.primary, fontSize: 13 },
  communityCard: { borderColor: 'rgba(184,98,63,0.16)', backgroundColor: 'rgba(255,253,248,0.86)' },
  followStatsRow: { flexDirection: 'row-reverse', alignItems: 'stretch' },
  followStatTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  followStatPressed: { backgroundColor: 'rgba(184,98,63,0.06)' },
  followStatIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  followStatIconAccent: { backgroundColor: colors.accentSoft },
  followStatLabel: { fontSize: 12 },
  followStatValue: { fontSize: 20 },
  followDivider: { width: StyleSheet.hairlineWidth, marginVertical: spacing.sm, backgroundColor: colors.border },
  quickActionsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '48%',
    minHeight: 112,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.15)',
    backgroundColor: 'rgba(255,253,248,0.88)',
    padding: spacing.md,
    gap: spacing.xs,
  },
  quickActionPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionTitle: { fontSize: 15, marginTop: 2 },
  quickActionDescription: { fontSize: 12, lineHeight: 18 },
  quickActionArrow: { marginTop: 'auto', alignSelf: 'flex-start' },
  activeStoryBanner: {
    minHeight: 90,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
    padding: spacing.md,
  },
  activeStoryBannerPressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  activeStoryIcon: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  activeStoryCopy: { flex: 1, minWidth: 0, gap: 2 },
  activeStoryDescription: { fontSize: 12, lineHeight: 18 },
  detailsCard: { gap: spacing.md, borderColor: 'rgba(184,98,63,0.15)', backgroundColor: 'rgba(255,253,248,0.88)' },
  detailBlock: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  detailIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  detailIconAccent: { backgroundColor: colors.accentSoft },
  detailCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  detailBody: { fontSize: 13, lineHeight: 21 },
  emptyDetailRow: { gap: spacing.sm },
  inlineAction: { color: colors.primary, fontSize: 13 },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  navigationCard: { paddingVertical: 0, borderColor: 'rgba(184,98,63,0.15)', backgroundColor: 'rgba(255,253,248,0.9)' },
  navigationRow: {
    minHeight: 66,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  navigationRowLast: { borderBottomWidth: 0 },
  pressedRow: { opacity: 0.72, backgroundColor: 'rgba(184,98,63,0.04)' },
  navigationIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  navigationCopy: { flex: 1, minWidth: 0, gap: 3 },
  navigationTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  navigationTitle: { fontSize: 15, flexShrink: 1 },
  navigationDescription: { fontSize: 12, lineHeight: 18 },
  navigationArrow: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  navigationBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  navigationBadgeText: { color: colors.white, fontSize: 11 },
  readinessCard: { gap: spacing.md, borderColor: 'rgba(62,124,115,0.17)', backgroundColor: 'rgba(255,253,248,0.9)' },
  readinessFeature: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  readinessIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  readinessIconSuccess: { backgroundColor: colors.successSoft },
  readinessCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  readinessTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  readinessDescription: { fontSize: 13, lineHeight: 20 },
  readinessMeta: { fontSize: 12, lineHeight: 18 },
  statusPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  statusPillSuccess: { backgroundColor: colors.successSoft, borderColor: 'rgba(47,125,75,0.2)' },
  statusPillText: { color: colors.textMuted, fontSize: 11 },
  statusPillTextSuccess: { color: colors.success },
  sessionCard: { gap: spacing.md, borderColor: 'rgba(29,26,22,0.1)', backgroundColor: 'rgba(255,253,248,0.86)' },
  sessionCopy: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sessionIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  sessionDescription: { flex: 1, fontSize: 13, lineHeight: 20 },
  dangerCard: { gap: spacing.md, borderColor: 'rgba(180,67,67,0.28)', backgroundColor: 'rgba(246,223,223,0.34)' },
  dangerIntro: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  dangerIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  dangerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  dangerTitle: { color: colors.danger },
  dangerDescription: { fontSize: 13, lineHeight: 20 },
  errorCard: { gap: spacing.md, alignItems: 'stretch', borderColor: 'rgba(184,98,63,0.22)', backgroundColor: 'rgba(255,253,248,0.88)' },
  errorIconShell: { width: 46, height: 46, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, alignSelf: 'center' },
  errorCopy: { gap: spacing.xs, alignItems: 'center' },
  errorTitle: { fontSize: 18 },
  errorDescription: { textAlign: 'center', lineHeight: 21 },
  errorText: { color: colors.danger, fontSize: 13 },
  successText: { color: colors.success, fontSize: 12, lineHeight: 18 },
  loadingStack: { gap: spacing.md },
  loadingHero: { overflow: 'hidden', minHeight: 218, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  loadingCover: { height: 132, backgroundColor: colors.primarySoft },
  loadingIdentityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: -28 },
  loadingAvatar: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: colors.surface, backgroundColor: '#E5CDBD' },
  loadingCopy: { flex: 1, gap: spacing.sm, paddingTop: spacing.lg },
  loadingTitle: { width: '68%', height: 22, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  loadingLineSmall: { width: '44%', height: 13, borderRadius: radii.sm, backgroundColor: '#E9E0D8' },
  loadingActions: { flexDirection: 'row-reverse', gap: spacing.sm },
  loadingAction: { flex: 1, height: 46, borderRadius: radii.md, backgroundColor: '#E8DDD3' },
  loadingCard: { height: 142, borderRadius: radii.xl, backgroundColor: 'rgba(238,216,203,0.68)' },
  loadingCardCompact: { height: 104, borderRadius: radii.xl, backgroundColor: 'rgba(215,232,229,0.68)' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(29,26,22,0.48)', justifyContent: 'flex-end', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm },
  sheetHandle: { width: 44, height: 4, borderRadius: radii.round, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.sm },
  sheetHeader: { gap: spacing.xs, marginBottom: spacing.sm },
  sheetTitle: { fontSize: 20 },
  sheetDescription: { fontSize: 13 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  viewerClose: { position: 'absolute', top: spacing.xxl, left: spacing.lg, width: 44, height: 44, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  viewerImage: { width: '100%', height: '75%' },
  viewerFallbackText: { color: colors.white },
});
