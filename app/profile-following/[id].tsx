import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth';
import { fetchUserFollowState, followUserFromMobile, unfollowUserFromMobile } from '@/lib/user-follows';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';

type FollowProfileRow = { profile_id: string; display_name: string | null; username: string | null; avatar_url: string | null; city: string | null; area: string | null };

function normalizeRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

export default function FollowingScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeRouteParam(params.id);
  const { user } = useAuth();
  const [rows, setRows] = useState<FollowProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await (await import('@/lib/supabase/client')).supabase.rpc('get_profile_following', { p_profile_user_id: id, p_limit: 50 });
    if (rpcError) {
      setError('تعذر تحميل قائمة المتابَعين حالياً. حاول مرة أخرى.');
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as FollowProfileRow[]);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  return <AppScreen scrollable><AppCard><AppText weight="semibold">يتابع</AppText>{loading ? <AppText muted>جاري التحميل...</AppText> : null}{!loading && error ? <View style={styles.group}><AppText muted>{error}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void load()} /></View> : null}{!loading && !error && rows.length === 0 ? <EmptyState title="لا يتابع أي شخص بعد." description="عندما يبدأ بمتابعة ملفات أخرى ستظهر هنا." /> : null}{!loading && !error ? rows.map((p) => <Row key={p.profile_id} profile={p} currentUserId={user?.id ?? ''} onRefresh={load} />) : null}</AppCard></AppScreen>;
}

function Row({ profile, currentUserId, onRefresh }: { profile: FollowProfileRow; currentUserId: string; onRefresh: () => Promise<void> }) {
  const [state, setState] = useState<{ followingByMe: boolean; followsMe: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    if (!currentUserId || currentUserId === profile.profile_id) return;
    const res = await fetchUserFollowState(currentUserId, profile.profile_id);
    if (res.ok) setState(res.state);
  }, [currentUserId, profile.profile_id]);

  useEffect(() => { void refreshState(); }, [refreshState]);

  const onToggle = async () => {
    if (!currentUserId || currentUserId === profile.profile_id || busy) return;
    setBusy(true);
    setMessage(null);
    const result = state?.followingByMe ? await unfollowUserFromMobile(currentUserId, profile.profile_id) : await followUserFromMobile(currentUserId, profile.profile_id);
    if (!result.ok) setMessage(result.message);
    await refreshState();
    void onRefresh();
    setBusy(false);
  };

  const label = state?.followingByMe ? 'إلغاء المتابعة' : state?.followsMe ? 'تابعه أيضًا' : 'تابع';
  const location = [profile.city, profile.area].filter(Boolean).join(' - ');
  const initial = (profile.display_name || 'ت').trim().charAt(0);

  return <Pressable style={styles.row} onPress={() => router.push(`/profile/${profile.profile_id}`)}><View style={styles.avatarWrap}>{profile.avatar_url ? <ExpoImage source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" transition={120} /> : <View style={styles.avatarFallback}><AppText>{initial}</AppText></View>}</View><View style={{ flex: 1 }}><AppText weight="semibold">{profile.display_name || 'مستخدم تِسوى'}</AppText><AppText muted>{profile.username ? `@${profile.username}` : ''}</AppText>{location ? <AppText muted>{location}</AppText> : null}{message ? <AppText muted>{message}</AppText> : null}</View>{currentUserId !== profile.profile_id ? <AppButton label={busy ? 'جاري التنفيذ...' : label} onPress={onToggle} variant="neutral" disabled={busy} /> : null}</Pressable>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 12, gap: 8 }, group: { marginTop: 10, gap: 8 }, avatarWrap: { width: 42, height: 42, borderRadius: radii.round, overflow: 'hidden' }, avatar: { width: '100%', height: '100%' }, avatarFallback: { width: '100%', height: '100%', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', borderRadius: radii.round } });
