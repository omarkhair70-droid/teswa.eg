import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { ProfileLivingHero } from '@/components/profile/ProfileLivingHero';
import { ProfilePresenceSignals } from '@/components/profile/ProfilePresenceSignals';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchActiveStoriesByUserId } from '@/lib/stories';
import { buildProfilePresence } from '@/lib/profile-presence';
import { useAuth } from '@/lib/auth';
import { blockUserFromMobile, fetchUserBlockState, unblockUserFromMobile } from '@/lib/user-blocks';
import { fetchUserFollowState, followUserFromMobile, unfollowUserFromMobile } from '@/lib/user-follows';
import { fetchPublicProfileActiveListings, fetchPublicProfileById, PublicProfile, PublicProfileListing } from '@/lib/profiles';
import {
  deletePublicProfileCache,
  deletePublicProfileListingsCache,
  readAnyPublicProfileCache,
  readAnyPublicProfileListingsCache,
  readFreshPublicProfileCache,
  readFreshPublicProfileListingsCache,
  writePublicProfileCache,
  writePublicProfileListingsCache,
} from '@/lib/offline-public-profile-cache';

const FETCH_ERROR = 'تعذر تحميل الملف العام حالياً. حاول مرة أخرى.';
const PRESENCE_ERROR = 'تعذر تحميل القصص والعناصر لهذا الملف حالياً.';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStoriesCount, setActiveStoriesCount] = useState(0);
  const [listings, setListings] = useState<PublicProfileListing[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [profileCacheNotice, setProfileCacheNotice] = useState<string | null>(null);
  const [listingsCacheNotice, setListingsCacheNotice] = useState<string | null>(null);
  const { user } = useAuth();
  const profileConfirmedMissingRef = useRef(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [followState, setFollowState] = useState({ followingByMe: false, followsMe: false, mutual: false, followerCount: 0, followingCount: 0 });
  const [followBusy, setFollowBusy] = useState(false);
  const [followMessage, setFollowMessage] = useState<string | null>(null);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return null;
    const date = new Date(profile.created_at);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
  }, [profile?.created_at]);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setProfileCacheNotice(null);
    profileConfirmedMissingRef.current = false;

    let hasFreshCachedProfile = false;

    try {
      const cached = await readFreshPublicProfileCache(id);
      if (cached) {
        hasFreshCachedProfile = true;
        setProfile(cached.profile);
        setLoading(false);
        setProfileCacheNotice('نستعرض ملفًا محفوظًا بينما نتحقق من الأحدث.');
      }
    } catch {
      // Ignore cache failures and continue with network source of truth.
    }

    try {
      const profileData = await fetchPublicProfileById(id);

      if (profileData) {
        profileConfirmedMissingRef.current = false;
        setProfile(profileData);
        setError(null);
        setProfileCacheNotice(null);
        void writePublicProfileCache(id, profileData);
        return;
      }

      profileConfirmedMissingRef.current = true;
      setProfile(null);
      setProfileCacheNotice(null);
      void deletePublicProfileCache(id);
      void deletePublicProfileListingsCache(id);
    } catch {
      if (hasFreshCachedProfile) {
        setError(null);
        setProfileCacheNotice('تعذر تحديث الملف الآن، نعرض آخر نسخة محفوظة.');
        return;
      }

      try {
        const stale = await readAnyPublicProfileCache(id);
        if (stale) {
          setProfile(stale.profile);
          setError(null);
          setProfileCacheNotice('أنت ترى نسخة محفوظة من الملف العام. سنحدّثها عندما يتحسن الاتصال.');
          return;
        }
      } catch {
        // Ignore cache failures and preserve hard error fallback.
      }

      setError(FETCH_ERROR);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadPresence = useCallback(async () => {
    if (!id) return;
    setPresenceLoading(true);
    setPresenceError(null);
    setListingsCacheNotice(null);

    let hasFreshCachedListings = false;

    try {
      const cachedListings = await readFreshPublicProfileListingsCache(id);
      if (cachedListings) {
        hasFreshCachedListings = true;
        setListings(cachedListings.listings);
        setListingsCacheNotice('نستعرض عناصر محفوظة بينما نتحقق من القائمة الحالية.');
      }
    } catch {
      // Ignore cache failures and continue with live presence fetch.
    }

    try {
      const [stories, activeListings] = await Promise.all([
        fetchActiveStoriesByUserId(id),
        fetchPublicProfileActiveListings(id, 6),
      ]);
      setActiveStoriesCount(stories.length);
      setListings(activeListings);
      setPresenceError(null);
      setListingsCacheNotice(null);
      if (!profileConfirmedMissingRef.current) {
        void writePublicProfileListingsCache(id, activeListings);
      }
    } catch {
      setActiveStoriesCount(0);

      if (hasFreshCachedListings) {
        setPresenceError(null);
        setListingsCacheNotice('تعذر تحديث العناصر الآن، نعرض آخر نسخة محفوظة.');
      } else {
        try {
          const stale = await readAnyPublicProfileListingsCache(id);
          if (stale) {
            setListings(stale.listings);
            setPresenceError(null);
            setListingsCacheNotice('أنت ترى عناصر محفوظة لهذا الملف. سنحدّثها عندما يتحسن الاتصال.');
            return;
          }
        } catch {
          // Ignore cache failures and preserve hard error fallback.
        }

        setPresenceError(PRESENCE_ERROR);
        setListings([]);
      }
    } finally {
      setPresenceLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  const profileId = profile?.id ?? '';
  const isOwnProfile = !!user?.id && !!profileId && user.id === profileId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !profile?.id || user.id === profile.id) return;
      const state = await fetchUserBlockState(user.id, profile.id);
      if (!cancelled && state.ok) setBlockedByMe(state.state.blockedByMe);
      if (!cancelled && !state.ok) setBlockError(state.message);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, user?.id]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !profile?.id || user.id === profile.id) return;
      const state = await fetchUserFollowState(user.id, profile.id);
      if (!cancelled && state.ok) setFollowState(state.state);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, user?.id]);

  const onToggleFollow = useCallback(async () => {
    if (!user?.id || !profile?.id || followBusy) return;
    setFollowBusy(true); setFollowMessage(null);
    const result = followState.followingByMe ? await unfollowUserFromMobile(user.id, profile.id) : await followUserFromMobile(user.id, profile.id);
    setFollowMessage(result.message);
    const state = await fetchUserFollowState(user.id, profile.id);
    if (state.ok) setFollowState(state.state);
    setFollowBusy(false);
  }, [followBusy, followState.followingByMe, profile?.id, user?.id]);

  const onToggleBlock = useCallback(async () => {
    if (!user?.id || !profile?.id || blockBusy) return;
    setBlockBusy(true); setBlockError(null);
    const res = blockedByMe ? await unblockUserFromMobile(user.id, profile.id) : await blockUserFromMobile(user.id, profile.id);
    if (!res.ok) setBlockError(res.message);
    else {
      const state = await fetchUserBlockState(user.id, profile.id);
      if (state.ok) setBlockedByMe(state.state.blockedByMe);
    }
    setBlockBusy(false);
  }, [blockBusy, blockedByMe, profile?.id, user?.id]);

  if (!id) return <AppScreen><EmptyState title="معرّف غير صالح" description="تعذر تحديد الملف المطلوب." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحضير الملف العام." /></AppScreen>;
  if (error) {
    return <AppScreen><View style={styles.stateBox}><EmptyState title="خطأ في التحميل" description={error} /><AppButton label="إعادة المحاولة" onPress={loadProfile} /></View></AppScreen>;
  }
  if (!profile) return <AppScreen><EmptyState title="الملف غير موجود" description="قد يكون الحساب غير متاح حالياً أو تم حذفه." /></AppScreen>;

  const displayName = profile.display_name?.trim() || 'مستخدم تِسوى';
  const location = [profile.city, profile.area].filter(Boolean).join(' - ');

  const profilePresence = buildProfilePresence({
    activeStoriesCount,
    listingsCount: listings.length,
    successfulSwapsCount: profile.successful_swaps_count ?? 0,
    responseRate: profile.response_rate ?? null,
    variant: 'public',
  });

  return (
    <AppScreen scrollable>
      <ProfileLivingHero
        coverUrl={profile.cover_url}
        avatarUrl={profile.avatar_url}
        displayName={displayName}
        username={profile.username}
        tagline={profile.profile_tagline}
        location={location || null}
        memberSince={memberSince}
        activeStoriesCount={activeStoriesCount}
        onOpenStories={activeStoriesCount > 0 ? () => router.push(`/story/${profile.id}`) : null}
        variant="public"
      />

      {profileCacheNotice ? (
        <AppCard>
          <AppText muted>{profileCacheNotice}</AppText>
        </AppCard>
      ) : null}

      <ProfilePresenceSignals presence={profilePresence} />



      {!isOwnProfile ? (
        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">العلاقة</AppText>
            <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}>
              <Pressable onPress={() => router.push(`/profile-followers/${profile.id}`)}><AppText>المتابعون: {followState.followerCount}</AppText></Pressable>
              <Pressable onPress={() => router.push(`/profile-following/${profile.id}`)}><AppText>يتابع: {followState.followingCount}</AppText></Pressable>
            </View>
            <AppButton label={followBusy ? 'جاري التنفيذ...' : (followState.followingByMe ? 'إلغاء المتابعة' : (followState.followsMe ? 'تابعه أيضًا' : 'تابع'))} onPress={onToggleFollow} disabled={followBusy || blockedByMe} />
            {followState.followsMe && !followState.followingByMe ? <AppText muted>يتابعك</AppText> : null}
            {followState.mutual ? <AppText muted>متابعة متبادلة</AppText> : null}
            {followMessage ? <AppText muted>{followMessage}</AppText> : null}
          </View>
        </AppCard>
      ) : null}

      {!isOwnProfile ? (
        <AppCard>
          <View style={styles.group}>
            <AppText weight="semibold">الأمان</AppText>
            <AppText muted>لو احتجت، تقدر تبلغ عن المستخدم أو تتحكم في الحظر.</AppText>
            <AppButton label="الإبلاغ عن المستخدم" variant="neutral" onPress={() => router.push(`/report/user/${profile.id}`)} />
            <AppButton label={blockBusy ? 'جاري التنفيذ...' : (blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم')} onPress={onToggleBlock} disabled={blockBusy} variant="neutral" />
            {blockError ? <AppText muted>{blockError}</AppText> : null}
          </View>
        </AppCard>
      ) : null}

      <AppCard>
        <View style={styles.group}>
          <AppText weight="semibold">نبذة</AppText>
          {profile.bio?.trim() ? <AppText>{profile.bio}</AppText> : <AppText muted>لم يضف نبذة بعد.</AppText>}
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.group}>
          <AppText weight="semibold">الثقة والإحصائيات</AppText>
          <AppText>المقايضات الناجحة: {profile.successful_swaps_count ?? 0}</AppText>
          <AppText>معدل الرد: {profile.response_rate != null ? `${profile.response_rate}%` : 'غير متاح بعد'}</AppText>
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.group}>
          <AppText weight="semibold">عناصره المعروضة</AppText>
          <AppText muted>آخر العناصر النشطة التي يعرضها للتبديل.</AppText>
          {presenceLoading ? <AppText muted>جاري تحميل العناصر والقصص...</AppText> : null}
          {listingsCacheNotice ? <AppText muted>{listingsCacheNotice}</AppText> : null}
          {!presenceLoading && presenceError ? (
            <AppText style={styles.presenceErrorText}>{PRESENCE_ERROR}</AppText>
          ) : null}
          {!presenceLoading && !presenceError && listings.length === 0 ? (
            <AppText muted>لا توجد عناصر نشطة معروضة حاليًا.</AppText>
          ) : null}
          {!presenceLoading && !presenceError && listings.length > 0 ? (
            <View style={styles.listingsList}>
              {listings.map((listing) => {
                const metaParts = [listing.category, listing.city, listing.area].filter(Boolean);
                const meta = metaParts.length > 0 ? metaParts.join(' • ') : null;
                return (
                  <Pressable
                    key={listing.id}
                    style={styles.listingRow}
                    onPress={() => router.push(`/item/${listing.id}`)}
                  >
                    {listing.imageUrl ? (
                      <ExpoImage source={{ uri: listing.imageUrl }} style={styles.listingImage} contentFit="cover" transition={150} />
                    ) : (
                      <View style={[styles.listingImage, styles.listingImageFallback]}>
                        <AppText muted>بدون صورة</AppText>
                      </View>
                    )}
                    <View style={styles.listingContent}>
                      <View style={styles.listingTitleRow}>
                        <AppText numberOfLines={1} weight="semibold" style={styles.listingTitle}>{listing.title}</AppText>
                        {listing.hasVideoTeaser === true ? (
                          <View style={styles.listingVideoBadge}>
                            <Ionicons name="play-circle-outline" size={13} color={colors.primary} />
                            <AppText weight="semibold" style={styles.listingVideoBadgeText}>لمحة فيديو</AppText>
                          </View>
                        ) : null}
                      </View>
                      {meta ? <AppText muted numberOfLines={1}>{meta}</AppText> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stateBox: { gap: spacing.md },
  group: { gap: spacing.sm },
  presenceErrorText: { color: '#B42318' },
  listingsList: { gap: spacing.sm },
  listingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listingImage: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  listingImageFallback: { justifyContent: 'center', alignItems: 'center' },
  listingContent: { flex: 1, gap: spacing.xs },
  listingTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  listingTitle: { flex: 1 },
  listingVideoBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    backgroundColor: 'rgba(184,98,63,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
  },
  listingVideoBadgeText: { color: colors.primary, fontSize: 11 },
});
