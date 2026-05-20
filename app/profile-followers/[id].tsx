import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/lib/auth';
import { fetchUserFollowState, followUserFromMobile, unfollowUserFromMobile } from '@/lib/user-follows';

type FollowProfileRow = { profile_id: string; display_name: string | null; username: string | null; city: string | null; area: string | null };

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [rows, setRows] = useState<FollowProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await (await import('@/lib/supabase/client')).supabase.rpc('get_profile_followers', { p_profile_user_id: id, p_limit: 50 });
    setRows((data ?? []) as FollowProfileRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return <AppScreen scrollable><AppCard><AppText weight="semibold">المتابعون</AppText>{loading ? <AppText muted>جاري التحميل...</AppText> : null}{rows.map((p) => <Row key={p.profile_id} profile={p} currentUserId={user?.id ?? ''} onRefresh={load} />)}</AppCard></AppScreen>;
}

function Row({ profile, currentUserId, onRefresh }: { profile: FollowProfileRow; currentUserId: string; onRefresh: () => Promise<void> }) {
  const [state, setState] = useState<{ followingByMe: boolean; followsMe: boolean } | null>(null);
  useEffect(() => { if (!currentUserId || currentUserId === profile.profile_id) return; fetchUserFollowState(currentUserId, profile.profile_id).then((res) => { if (res.ok) setState(res.state); }); }, [currentUserId, profile.profile_id]);
  const onToggle = async () => { if (!currentUserId || currentUserId === profile.profile_id) return; if (state?.followingByMe) await unfollowUserFromMobile(currentUserId, profile.profile_id); else await followUserFromMobile(currentUserId, profile.profile_id); await onRefresh(); };
  const label = state?.followingByMe ? 'إلغاء المتابعة' : state?.followsMe ? 'تابعه أيضًا' : 'تابع';
  return <Pressable style={styles.row} onPress={() => router.push(`/profile/${profile.profile_id}`)}><View style={{ flex: 1 }}><AppText weight="semibold">{profile.display_name || 'مستخدم تِسوى'}</AppText><AppText muted>{profile.username ? `@${profile.username}` : ''}</AppText></View>{currentUserId !== profile.profile_id ? <AppButton label={label} onPress={onToggle} variant="neutral" /> : null}</Pressable>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 12, gap: 8 } });
