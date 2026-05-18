import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchStoryViewersForOwner, StoryViewersContext } from '@/lib/story-views';

export default function StoryViewersScreen() {
  const { user } = useAuth();
  const { storyId } = useLocalSearchParams<{ storyId?: string }>();
  const normalizedStoryId = storyId?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [context, setContext] = useState<StoryViewersContext | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    if (!normalizedStoryId) {
      setLoading(false);
      setContext(null);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const result = await fetchStoryViewersForOwner({ ownerId: user.id, storyId: normalizedStoryId });
      setContext(result);
    } catch {
      setError(true);
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [normalizedStoryId, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const createdLabel = useMemo(() => {
    if (!context?.storyCreatedAt) return null;
    const date = new Date(context.storyCreatedAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }, [context?.storyCreatedAt]);

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لعرض مشاهدي القصة." /></AppScreen>;
  if (!normalizedStoryId) return <AppScreen><EmptyState title="رابط غير صالح" description="معرّف القصة غير صالح." /></AppScreen>;
  if (loading) return <AppScreen><AppText muted>جارٍ تحميل المشاهدين...</AppText></AppScreen>;

  if (error) {
    return (
      <AppScreen>
        <View style={styles.content}>
          <EmptyState title="تعذر تحميل المشاهدين" description="حاول مرة أخرى بعد قليل." />
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void load()} />
        </View>
      </AppScreen>
    );
  }

  if (!context) {
    return (
      <AppScreen>
        <View style={styles.content}>
          <EmptyState title="القصة غير متاحة" description="قد تكون القصة غير موجودة أو ليس لديك صلاحية الوصول." />
          <AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppCard>
          <View style={styles.group}>
            <AppText weight="bold" style={styles.title}>مشاهدو القصة</AppText>
            <AppText muted>هنا تشوف مين مرّ على هذه القصة.</AppText>
            {context.storyCaption ? <AppText numberOfLines={2}>تعليق القصة: {context.storyCaption}</AppText> : null}
            {createdLabel ? <AppText muted>نُشرت: {createdLabel}</AppText> : null}
          </View>
        </AppCard>

        {!context.viewers.length ? (
          <View style={styles.group}>
            <EmptyState
              title="لسه محدش شاف القصة دي"
              description="لما تبدأ المشاهدات، هتظهر هنا."
            />
            <AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} />
          </View>
        ) : (
          context.viewers.map((viewer: StoryViewersContext['viewers'][number]) => {
            const name = viewer.displayName ?? viewer.username ?? 'مستخدم';
            const initial = name.charAt(0).toUpperCase();
            const viewedAtDate = new Date(viewer.viewedAt);
            const viewedAtLabel = Number.isNaN(viewedAtDate.getTime())
              ? viewer.viewedAt
              : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(viewedAtDate);

            return (
              <Pressable key={`${viewer.viewerId}-${viewer.viewedAt}`} onPress={() => router.push(`/profile/${viewer.viewerId}`)}>
                <AppCard>
                  <View style={styles.viewerRow}>
                    <View style={styles.avatarWrap}>
                      {viewer.avatarUrl ? (
                        <ExpoImage source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
                      ) : (
                        <AppText weight="bold">{initial}</AppText>
                      )}
                    </View>
                    <View style={styles.viewerMeta}>
                      <AppText weight="semibold">{name}</AppText>
                      {viewer.username ? <AppText muted>@{viewer.username}</AppText> : null}
                      <AppText muted>شاهدها {viewedAtLabel}</AppText>
                    </View>
                  </View>
                </AppCard>
              </Pressable>
            );
          })
        )}

        <AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  viewerMeta: { flex: 1, gap: 2 },
});
