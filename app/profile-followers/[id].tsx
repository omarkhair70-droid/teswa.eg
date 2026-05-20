import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { fetchUserFollowState, followUserFromMobile, unfollowUserFromMobile } from '@/lib/user-follows';
export default function FollowersScreen() { const { id } = useLocalSearchParams<{ id: string }>(); const { user } = useAuth(); const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(true); const load = useCallback(async () => { if (!id) return; setLoading(true); const { data } = await supabase.from('user_follows').select('follower_id, profiles!user_follows_follower_id_fkey(id, display_name, username, city, area)').eq('followed_id', id).order('created_at', { ascending: false }).limit(50); setRows((data ?? []).map((r: any) => r.profiles)); setLoading(false); }, [id]); useEffect(() => { load(); }, [load]); return <AppScreen scrollable><AppCard><AppText weight="semibold">المتابعون</AppText>{loading ? <AppText muted>جاري التحميل...</AppText> : null}{rows.map((p) => <Row key={p.id} profile={p} currentUserId={user?.id ?? ''} onRefresh={load} />)}</AppCard></AppScreen>; }
function Row({ profile, currentUserId, onRefresh }: any) { const [state, setState] = useState<any>(null); useEffect(() => { if (!currentUserId || !profile?.id || currentUserId === profile.id) return; fetchUserFollowState(currentUserId, profile.id).then((res) => { if (res.ok) setState(res.state); }); }, [currentUserId, profile?.id]); const onToggle = async () => { if (state?.followingByMe) await unfollowUserFromMobile(currentUserId, profile.id); else await followUserFromMobile(currentUserId, profile.id); onRefresh(); }; return <Pressable style={styles.row} onPress={() => router.push(`/profile/${profile.id}`)}><View style={{ flex: 1 }}><AppText weight="semibold">{profile.display_name || 'مستخدم تِسوى'}</AppText><AppText muted>{profile.username ? `@${profile.username}` : ''}</AppText></View>{currentUserId !== profile.id ? <AppButton label={state?.followingByMe ? 'تتابعه' : state?.followsMe ? 'تابعه أيضًا' : 'تابع'} onPress={onToggle} variant="neutral" /> : null}</Pressable>; }
const styles = StyleSheet.create({ row: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 12, gap: 8 } });
