import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { fetchUserFollowState, followUserFromMobile, unfollowUserFromMobile } from '@/lib/user-follows';

type ConnectionMode = 'followers' | 'following';
type FollowProfileRow = {
  profile_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  area: string | null;
};

type Props = { profileUserId: string; mode: ConnectionMode };

export function ProfileConnectionsScreen({ profileUserId, mode }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FollowProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const title = mode === 'followers' ? 'المتابعون' : 'يتابع';
  const description = mode === 'followers'
    ? 'الحسابات اللي اختارت تتابع هذا الملف.'
    : 'الحسابات اللي يتابعها صاحب الملف.';

  const load = useCallback(async (background = false) => {
    const id = profileUserId.trim();
    if (!id) {
      setLoading(false);
      setError('تعذر تحديد الملف المطلوب.');
      return;
    }
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const rpcName = mode === 'followers' ? 'get_profile_followers' : 'get_profile_following';
    const { data, error: rpcError } = await supabase.rpc(rpcName, { p_profile_user_id: id, p_limit: 50 });
    if (rpcError) {
      setRows([]);
      setError(mode === 'followers' ? 'تعذر تحميل قائمة المتابعين حالياً.' : 'تعذر تحميل قائمة المتابَعين حالياً.');
    } else {
      setRows((data ?? []) as FollowProfileRow[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [mode, profileUserId]);

  useEffect(() => { void load(); }, [load]);

  const isOwnList = Boolean(user?.id && user.id === profileUserId);
  const contextLabel = isOwnList ? 'شبكتك على تِسوى' : 'شبكة هذا الملف';

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للملف" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>{contextLabel}</AppText>
          <AppText weight="bold" style={styles.title}>{title}</AppText>
          <AppText muted style={styles.subtitle}>{description}</AppText>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}><Ionicons name={mode === 'followers' ? 'people-outline' : 'person-add-outline'} size={22} color={colors.primary} /></View>
        <View style={styles.summaryCopy}><AppText weight="bold" style={styles.countValue}>{loading ? '—' : rows.length}</AppText><AppText muted style={styles.countLabel}>{mode === 'followers' ? 'متابع ظاهر في القائمة' : 'حساب ظاهر في القائمة'}</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="تحديث القائمة" disabled={loading || refreshing} onPress={() => void load(true)} style={[styles.refreshButton, refreshing && styles.disabled]}><Ionicons name="refresh-outline" size={18} color={colors.textMuted} /></Pressable>
      </View>

      {error ? (
        <View style={styles.errorPanel}>
          <Ionicons name="alert-circle-outline" size={19} color={colors.danger} />
          <View style={styles.errorCopy}><AppText weight="semibold" style={styles.errorTitle}>تعذر تحميل القائمة</AppText><AppText style={styles.errorText}>{error}</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="إعادة المحاولة" onPress={() => void load()} style={styles.retryButton}><Ionicons name="refresh-outline" size={17} color={colors.danger} /></Pressable>
        </View>
      ) : null}

      {loading ? <ConnectionsSkeleton /> : null}

      {!loading && !error && rows.length === 0 ? (
        <View style={styles.emptyPanel}>
          <View style={styles.emptyIcon}><Ionicons name={mode === 'followers' ? 'people-outline' : 'compass-outline'} size={28} color={colors.accent} /></View>
          <AppText weight="bold" style={styles.emptyTitle}>{mode === 'followers' ? 'لسه مفيش متابعين' : 'لسه مش بيتابع حد'}</AppText>
          <AppText muted style={styles.emptyText}>{mode === 'followers' ? 'أول ما حد يتابع الملف هيظهر هنا.' : 'الحسابات اللي يبدأ يتابعها هتظهر هنا.'}</AppText>
          <AppButton label="الرجوع للملف" variant="neutral" onPress={() => router.back()} />
        </View>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <View style={styles.listPanel}>
          {rows.map((profile, index) => (
            <ConnectionRow
              key={profile.profile_id}
              profile={profile}
              currentUserId={user?.id ?? ''}
              last={index === rows.length - 1}
              onRefresh={() => load(true)}
            />
          ))}
        </View>
      ) : null}

      {!loading && rows.length >= 50 ? <View style={styles.limitNote}><Ionicons name="information-circle-outline" size={17} color={colors.textMuted} /><AppText muted style={styles.limitText}>بنعرض أحدث 50 حساب في القائمة حاليًا.</AppText></View> : null}
    </AppScreen>
  );
}

function ConnectionRow({ profile, currentUserId, last, onRefresh }: { profile: FollowProfileRow; currentUserId: string; last: boolean; onRefresh: () => Promise<void> }) {
  const [state, setState] = useState<{ followingByMe: boolean; followsMe: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    if (!currentUserId || currentUserId === profile.profile_id) return;
    const result = await fetchUserFollowState(currentUserId, profile.profile_id);
    if (result.ok) setState(result.state);
  }, [currentUserId, profile.profile_id]);

  useEffect(() => { void refreshState(); }, [refreshState]);

  const toggleFollow = async () => {
    if (!currentUserId || currentUserId === profile.profile_id || busy) return;
    setBusy(true);
    setMessage(null);
    const result = state?.followingByMe
      ? await unfollowUserFromMobile(currentUserId, profile.profile_id)
      : await followUserFromMobile(currentUserId, profile.profile_id);
    if (!result.ok) setMessage(result.message);
    await refreshState();
    void onRefresh();
    setBusy(false);
  };

  const displayName = profile.display_name?.trim() || 'مستخدم تِسوى';
  const initial = displayName.charAt(0).toUpperCase() || 'ت';
  const location = [profile.city, profile.area].filter(Boolean).join(' · ');
  const actionLabel = state?.followingByMe ? 'متابَع' : state?.followsMe ? 'تابعه كمان' : 'متابعة';
  const relationshipLabel = state?.followingByMe && state.followsMe ? 'متابعة متبادلة' : state?.followsMe ? 'بيتابعك' : null;

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`فتح ملف ${displayName}`} onPress={() => router.push(`/profile/${profile.profile_id}`)} style={styles.profileTapArea}>
        <View style={styles.avatarWrap}>{profile.avatar_url ? <ExpoImage source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" transition={120} /> : <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarInitial}>{initial}</AppText></View>}</View>
        <View style={styles.profileCopy}>
          <View style={styles.nameLine}><AppText weight="semibold" style={styles.name} numberOfLines={1}>{displayName}</AppText>{relationshipLabel ? <View style={styles.relationPill}><AppText style={styles.relationText}>{relationshipLabel}</AppText></View> : null}</View>
          {profile.username ? <AppText muted style={styles.username}>@{profile.username}</AppText> : null}
          {location ? <View style={styles.locationRow}><Ionicons name="location-outline" size={12} color={colors.textMuted} /><AppText muted style={styles.locationText}>{location}</AppText></View> : null}
          {message ? <AppText style={styles.rowError}>{message}</AppText> : null}
        </View>
      </Pressable>
      {currentUserId && currentUserId !== profile.profile_id ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} disabled={busy} onPress={() => void toggleFollow()} style={[styles.followButton, state?.followingByMe && styles.followButtonActive, busy && styles.disabled]}>
          {busy ? <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} /> : <AppText weight="semibold" style={[styles.followButtonText, state?.followingByMe && styles.followButtonTextActive]}>{actionLabel}</AppText>}
        </Pressable>
      ) : null}
    </View>
  );
}

function ConnectionsSkeleton() {
  return <View style={styles.listPanel}>{[0, 1, 2, 3].map((key) => <View key={key} style={styles.skeletonRow}><View style={styles.skeletonAvatar} /><View style={styles.skeletonCopy}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /></View><View style={styles.skeletonButton} /></View>)}</View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'right' },
  subtitle: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  summaryCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryIcon: { width: 46, height: 46, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  summaryCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  countValue: { fontSize: 22 },
  countLabel: { fontSize: 10 },
  refreshButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  errorPanel: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  errorTitle: { color: colors.danger },
  errorText: { color: colors.danger, fontSize: 11, textAlign: 'right' },
  retryButton: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  listPanel: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { minHeight: 82, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLast: { borderBottomWidth: 0 },
  profileTapArea: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  avatarWrap: { width: 50, height: 50, borderRadius: radii.round, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: { width: '100%', height: '100%', borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.primary, fontSize: 17 },
  profileCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  nameLine: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1, fontSize: 14, textAlign: 'right' },
  username: { fontSize: 10 },
  locationRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  locationText: { fontSize: 9 },
  relationPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.round, backgroundColor: colors.accentSoft },
  relationText: { color: colors.accent, fontSize: 8 },
  followButton: { minHeight: 36, minWidth: 74, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.round, backgroundColor: colors.primary },
  followButtonActive: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  followButtonText: { color: colors.white, fontSize: 10 },
  followButtonTextActive: { color: colors.text },
  rowError: { color: colors.danger, fontSize: 9, textAlign: 'right' },
  emptyPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  limitNote: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  limitText: { flex: 1, fontSize: 10, textAlign: 'right' },
  skeletonRow: { minHeight: 82, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  skeletonAvatar: { width: 50, height: 50, borderRadius: radii.round, backgroundColor: '#EEE7DF' },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTitle: { width: '45%', height: 12, alignSelf: 'flex-end', borderRadius: 6, backgroundColor: '#EEE7DF' },
  skeletonLine: { width: '64%', height: 9, alignSelf: 'flex-end', borderRadius: 5, backgroundColor: '#F3E7DB' },
  skeletonButton: { width: 72, height: 36, borderRadius: radii.round, backgroundColor: '#EEE7DF' },
  disabled: { opacity: 0.5 },
});
