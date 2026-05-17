import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchPublicProfileById, PublicProfile } from '@/lib/profiles';

const FETCH_ERROR = 'تعذر تحميل الملف العام حالياً. حاول مرة أخرى.';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const profileData = await fetchPublicProfileById(id);
      setProfile(profileData);
    } catch {
      setError(FETCH_ERROR);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!id) return <AppScreen><EmptyState title="معرّف غير صالح" description="تعذر تحديد الملف المطلوب." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحضير الملف العام." /></AppScreen>;
  if (error) {
    return <AppScreen><View style={styles.stateBox}><EmptyState title="خطأ في التحميل" description={error} /><AppButton label="إعادة المحاولة" onPress={loadProfile} /></View></AppScreen>;
  }
  if (!profile) return <AppScreen><EmptyState title="الملف غير موجود" description="قد يكون الحساب غير متاح حالياً أو تم حذفه." /></AppScreen>;

  const displayName = profile.display_name?.trim() || 'مستخدم تِسوى';
  const location = [profile.city, profile.area].filter(Boolean).join(' - ');

  return (
    <AppScreen scrollable>
      {profile.cover_url ? (
        <ExpoImage source={{ uri: profile.cover_url }} style={styles.cover} contentFit="cover" transition={200} cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}><AppText muted>لا توجد صورة غلاف</AppText></View>
      )}

      <AppCard>
        <View style={styles.headerCard}>
          {profile.avatar_url ? (
            <ExpoImage source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" transition={200} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}><AppText weight="bold">{displayName[0]}</AppText></View>
          )}
          <View style={styles.headerInfo}>
            <AppText weight="bold" style={styles.name}>{displayName}</AppText>
            {profile.username ? <AppText muted>@{profile.username}</AppText> : null}
            {profile.profile_tagline ? <AppText muted>{profile.profile_tagline}</AppText> : null}
            {location ? <AppText muted>{location}</AppText> : null}
            {memberSince ? <AppText muted>عضو منذ {memberSince}</AppText> : null}
          </View>
        </View>
      </AppCard>

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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', height: 180, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  coverFallback: { justifyContent: 'center', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed' },
  stateBox: { gap: spacing.md },
  headerCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  headerInfo: { flex: 1, gap: spacing.xs },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceAlt },
  avatarFallback: { justifyContent: 'center', alignItems: 'center', borderColor: colors.border, borderWidth: 1 },
  name: { fontSize: 22 },
  group: { gap: spacing.sm },
});
