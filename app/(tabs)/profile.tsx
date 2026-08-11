import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { ProfileAchievementSummary } from '@/components/profile/ProfileAchievementSummary';
import { ProfileLivingHero } from '@/components/profile/ProfileLivingHero';
import { ProfilePresenceSignals } from '@/components/profile/ProfilePresenceSignals';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchUserBadges, refreshMyBadges, type UserBadge } from '@/lib/badges';
import { buildProfilePresence } from '@/lib/profile-presence';
import {
  fetchMyAccountProfile,
  fetchPublicProfileActiveListings,
  type AccountProfile,
  type PublicProfileListing,
} from '@/lib/profiles';
import { fetchActiveStoriesByUserId } from '@/lib/stories';
import { fetchUserFollowState } from '@/lib/user-follows';
import { fetchUserTrustMetrics, type UserTrustMetrics } from '@/lib/trust-metrics';

type ProfileTab = 'listings' | 'stories';

function formatMemberSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
}

function ListingTile({ listing }: { listing: PublicProfileListing }) {
  const meta = listing.category ?? ([listing.city, listing.area].filter(Boolean).join(' · ') || 'معروض للتبديل');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`فتح ${listing.title}`}
      onPress={() => router.push(`/item/${listing.id}`)}
      style={({ pressed }) => [styles.listingTile, pressed && styles.pressed]}
    >
      <View style={styles.listingMedia}>
        {listing.imageUrl ? (
          <ExpoImage source={{ uri: listing.imageUrl }} style={styles.listingImage} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.listingPlaceholder}><Ionicons name="image-outline" size={25} color={colors.textMuted} /></View>
        )}
        {listing.hasVideoTeaser ? <View style={styles.videoBadge}><Ionicons name="play" size={11} color={colors.white} /><AppText style={styles.videoBadgeText}>فيديو</AppText></View> : null}
      </View>
      <View style={styles.listingCopy}>
        <AppText weight="semibold" numberOfLines={1} style={styles.listingTitle}>{listing.title}</AppText>
        <AppText muted numberOfLines={1} style={styles.listingMeta}>{meta}</AppText>
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [listings, setListings] = useState<PublicProfileListing[]>([]);
  const [activeStoriesCount, setActiveStoriesCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({ followerCount: 0, followingCount: 0 });
  const [trustMetrics, setTrustMetrics] = useState<UserTrustMetrics | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [supplementaryLoading, setSupplementaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('listings');

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const account = await fetchMyAccountProfile(userId);
      setProfile(account);
      if (!account) setError('تعذر العثور على ملفك الشخصي.');
    } catch {
      setError('تعذر تحميل ملفك حالياً. حاول مرة تانية.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadPresence = useCallback(async () => {
    if (!userId) return;
    setSupplementaryLoading(true);
    try {
      const [, listingsResult, storiesResult, followResult, trustResult] = await Promise.all([
        refreshMyBadges().catch(() => undefined),
        fetchPublicProfileActiveListings(userId, 12).catch(() => []),
        fetchActiveStoriesByUserId(userId).catch(() => []),
        fetchUserFollowState(userId, userId).catch(() => null),
        fetchUserTrustMetrics(userId).catch(() => null),
      ]);
      setListings(listingsResult);
      setActiveStoriesCount(storiesResult.length);
      if (followResult?.ok) setFollowCounts({ followerCount: followResult.state.followerCount, followingCount: followResult.state.followingCount });
      setTrustMetrics(trustResult);
      setBadges(await fetchUserBadges(userId).catch(() => []));
    } finally {
      setSupplementaryLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadProfile();
    void loadPresence();
  }, [loadPresence, loadProfile]));

  const displayName = profile?.display_name?.trim() || 'مستخدم تِسوى';
  const location = [profile?.city, profile?.area].filter(Boolean).join(' - ');
  const memberSince = formatMemberSince(profile?.created_at);
  const presence = useMemo(() => buildProfilePresence({
    activeStoriesCount,
    listingsCount: listings.length,
    successfulSwapsCount: profile?.successful_swaps_count ?? 0,
    responseRate: profile?.response_rate ?? null,
    variant: 'self',
  }), [activeStoriesCount, listings.length, profile?.response_rate, profile?.successful_swaps_count]);

  if (!user) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك عشان تشوف ملفك." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="alive"><View style={styles.loadingState}><View style={styles.loadingCover} /><View style={styles.loadingAvatar} /><View style={styles.loadingLine} /><View style={styles.loadingCard} /></View></AppScreen>;
  if (error || !profile) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="تعذر تحميل ملفك" description={error ?? 'تعذر العثور على الملف.'} /><AppButton label="إعادة المحاولة" onPress={() => void loadProfile()} /><AppButton label="الإعدادات" variant="neutral" onPress={() => router.push('/settings')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive" style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topCopy}><AppText muted style={styles.eyebrow}>مساحتك على تِسوى</AppText><AppText weight="bold" style={styles.pageTitle}>ملفي</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="فتح الإعدادات" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.roundAction, pressed && styles.pressed]}>
          <Ionicons name="settings-outline" size={21} color={colors.text} />
        </Pressable>
      </View>

      <AppFadeIn>
        <ProfileLivingHero
          coverUrl={profile.cover_url}
          avatarUrl={profile.avatar_url}
          displayName={displayName}
          username={profile.username}
          tagline={profile.profile_tagline}
          location={location || null}
          memberSince={memberSince}
          activeStoriesCount={activeStoriesCount}
          onOpenStories={activeStoriesCount > 0 ? () => router.push(`/story/${userId}`) : null}
          onPressAvatarRing={activeStoriesCount > 0 ? () => router.push(`/story/${userId}`) : null}
          onPressAvatar={() => router.push('/profile/edit')}
          variant="self"
        />
      </AppFadeIn>

      <View style={styles.actionRow}>
        <View style={styles.actionMain}><AppButton label="تعديل الملف" iconName="create-outline" onPress={() => router.push('/profile/edit')} fullWidth /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="عرض ملفي كما يراه الآخرون" onPress={() => router.push(`/profile/${userId}`)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
          <Ionicons name="eye-outline" size={18} color={colors.primary} /><AppText weight="semibold" style={styles.secondaryActionText}>عرض عام</AppText>
        </Pressable>
      </View>

      <AppCard padding="sm" style={styles.statsCard}>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/profile-followers/${userId}`)} style={styles.statItem}>
          <AppText weight="bold" style={styles.statValue}>{followCounts.followerCount}</AppText><AppText muted style={styles.statLabel}>متابع</AppText>
        </Pressable>
        <View style={styles.statDivider} />
        <Pressable accessibilityRole="button" onPress={() => router.push(`/profile-following/${userId}`)} style={styles.statItem}>
          <AppText weight="bold" style={styles.statValue}>{followCounts.followingCount}</AppText><AppText muted style={styles.statLabel}>يتابع</AppText>
        </Pressable>
        <View style={styles.statDivider} />
        <View style={styles.statItem}><AppText weight="bold" style={styles.statValue}>{profile.successful_swaps_count ?? 0}</AppText><AppText muted style={styles.statLabel}>تبديل ناجح</AppText></View>
      </AppCard>

      {profile.bio?.trim() ? (
        <View style={styles.bioSection}><AppText weight="bold" style={styles.sectionTitle}>عنّي</AppText><AppText style={styles.bioText}>{profile.bio}</AppText></View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')} style={({ pressed }) => [styles.bioPrompt, pressed && styles.pressed]}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <View style={styles.bioPromptCopy}><AppText weight="semibold">ضيف نبذة قصيرة</AppText><AppText muted style={styles.bioPromptText}>خلّي اللي يشوف ملفك يفهم ذوقك وإيه اللي بتحب تبدّله.</AppText></View>
        </Pressable>
      )}

      <ProfilePresenceSignals presence={presence} />
      <ProfileAchievementSummary trustMetrics={trustMetrics} badges={badges} loading={supplementaryLoading} />

      <View style={styles.contentHeader}>
        <View style={styles.contentHeaderCopy}><AppText muted style={styles.eyebrow}>محتواك</AppText><AppText weight="bold" style={styles.sectionTitle}>اللي بتشاركه على تِسوى</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="إضافة عنصر جديد" onPress={() => router.push('/(tabs)/add')} style={styles.addPill}><Ionicons name="add" size={17} color={colors.primary} /><AppText weight="semibold" style={styles.addPillText}>إضافة</AppText></Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'listings' }} onPress={() => setActiveTab('listings')} style={[styles.tab, activeTab === 'listings' && styles.tabActive]}>
          <Ionicons name="grid-outline" size={18} color={activeTab === 'listings' ? colors.primary : colors.textMuted} /><AppText weight="semibold" style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>المعروض</AppText><View style={styles.countPill}><AppText style={styles.countText}>{listings.length}</AppText></View>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'stories' }} onPress={() => setActiveTab('stories')} style={[styles.tab, activeTab === 'stories' && styles.tabActive]}>
          <Ionicons name="play-circle-outline" size={18} color={activeTab === 'stories' ? colors.primary : colors.textMuted} /><AppText weight="semibold" style={[styles.tabText, activeTab === 'stories' && styles.tabTextActive]}>القصص</AppText><View style={styles.countPill}><AppText style={styles.countText}>{activeStoriesCount}</AppText></View>
        </Pressable>
      </View>

      {activeTab === 'listings' ? (
        listings.length ? (
          <View style={styles.listingsGrid}>{listings.map((listing) => <ListingTile key={listing.id} listing={listing} />)}</View>
        ) : (
          <View style={styles.emptyContent}><View style={styles.emptyIcon}><Ionicons name="cube-outline" size={26} color={colors.primary} /></View><AppText weight="bold" style={styles.emptyTitle}>لسه مفيش حاجة معروضة</AppText><AppText muted style={styles.emptyDescription}>أول عنصر تنشره هيبقى بداية ملفك في التبديل.</AppText><AppButton label="إضافة أول عنصر" onPress={() => router.push('/(tabs)/add')} /></View>
        )
      ) : (
        <View style={styles.storyPanel}>
          <View style={styles.storyIcon}><Ionicons name="sparkles-outline" size={24} color={colors.accent} /></View>
          <View style={styles.storyCopy}><AppText weight="bold" style={styles.storyTitle}>{activeStoriesCount > 0 ? `عندك ${activeStoriesCount} قصة نشطة` : 'شارك حاجة خفيفة من يومك'}</AppText><AppText muted style={styles.storyDescription}>{activeStoriesCount > 0 ? 'شوف قصصك زي ما المجتمع شايفها أو رتّبها من الإدارة.' : 'القصة أسرع طريقة تخلي ملفك حي من غير ما تنشر عنصر جديد.'}</AppText></View>
          <View style={styles.storyActions}>
            <AppButton label={activeStoriesCount > 0 ? 'عرض القصص' : 'إنشاء قصة'} onPress={() => activeStoriesCount > 0 ? router.push(`/story/${userId}`) : router.push('/story/create')} />
            <AppButton label="إدارة القصص" variant="neutral" onPress={() => router.push('/story/manage')} />
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg },
  topBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  topCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  eyebrow: { fontSize: 12 },
  pageTitle: { fontSize: 27, lineHeight: 34 },
  roundAction: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionRow: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: spacing.sm },
  actionMain: { flex: 1 },
  secondaryAction: { minWidth: 110, minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryActionText: { color: colors.primary, fontSize: 12 },
  statsCard: { flexDirection: 'row-reverse', alignItems: 'stretch' },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 58 },
  statValue: { fontSize: 19 },
  statLabel: { fontSize: 11 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  bioSection: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 19, lineHeight: 25, textAlign: 'right' },
  bioText: { lineHeight: 22, textAlign: 'right' },
  bioPrompt: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bioPromptCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  bioPromptText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  contentHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  contentHeaderCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  addPill: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  addPillText: { color: colors.primary, fontSize: 12 },
  tabs: { flexDirection: 'row-reverse', gap: spacing.xs, padding: 4, borderRadius: radii.lg, backgroundColor: '#EEE7DF' },
  tab: { flex: 1, minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.md },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 12, color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  countPill: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  countText: { fontSize: 10, color: colors.textMuted },
  listingsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  listingTile: { width: '48.5%', borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  listingMedia: { height: 145, backgroundColor: colors.background },
  listingImage: { width: '100%', height: '100%' },
  listingPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radii.round, backgroundColor: 'rgba(28,25,23,0.72)' },
  videoBadgeText: { color: colors.white, fontSize: 9 },
  listingCopy: { gap: 2, padding: spacing.sm },
  listingTitle: { fontSize: 13, textAlign: 'right' },
  listingMeta: { fontSize: 10, textAlign: 'right' },
  emptyContent: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyDescription: { textAlign: 'center', lineHeight: 20 },
  storyPanel: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  storyIcon: { width: 52, height: 52, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', backgroundColor: colors.accentSoft },
  storyCopy: { alignItems: 'flex-end', gap: 3 },
  storyTitle: { fontSize: 18, textAlign: 'right' },
  storyDescription: { lineHeight: 20, textAlign: 'right' },
  storyActions: { gap: spacing.sm },
  loadingState: { gap: spacing.md },
  loadingCover: { height: 170, borderRadius: radii.xl, backgroundColor: '#EEE7DF' },
  loadingAvatar: { width: 84, height: 84, borderRadius: radii.round, backgroundColor: '#E5DBD1', marginTop: -54, marginRight: spacing.lg },
  loadingLine: { width: '55%', height: 18, borderRadius: 9, backgroundColor: '#EEE7DF', alignSelf: 'flex-end' },
  loadingCard: { height: 82, borderRadius: radii.xl, backgroundColor: '#EEE7DF' },
  stateStack: { gap: spacing.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
