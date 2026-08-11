import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchStoryViewersForOwner, StoryViewersContext } from '@/lib/story-views';

function formatViewedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function StoryViewersScreen() {
  const { user } = useAuth();
  const { storyId } = useLocalSearchParams<{ storyId?: string }>();
  const normalizedStoryId = storyId?.trim() ?? '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [context, setContext] = useState<StoryViewersContext | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    if (!normalizedStoryId) { setLoading(false); setContext(null); setError(false); return; }
    setLoading(true);
    setError(false);
    try {
      setContext(await fetchStoryViewersForOwner({ ownerId: user.id, storyId: normalizedStoryId }));
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
    return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  }, [context?.storyCreatedAt]);

  if (!user) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لعرض مشاهدي القصة." /></AppScreen>;
  if (!normalizedStoryId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="معرّف القصة غير صالح." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="alive"><View style={styles.loadingStack}><View style={styles.loadingHeader} />{[0,1,2].map((key) => <View key={key} style={styles.loadingRow} />)}</View></AppScreen>;
  if (error) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="تعذر تحميل المشاهدين" description="حاول مرة أخرى بعد قليل." /><AppButton label="إعادة المحاولة" onPress={() => void load()} /><AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} /></View></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="القصة غير متاحة" description="قد تكون القصة غير موجودة أو ليس لديك صلاحية الوصول." /><AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع لإدارة القصص" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>تفاعل القصة</AppText><AppText weight="bold" style={styles.title}>المشاهدون</AppText><AppText muted style={styles.subtitle}>مين وصل للقصة وإمتى شافها.</AppText></View>
      </View>

      <View style={styles.storyContext}>
        <View style={styles.storyIcon}><Ionicons name="play-circle-outline" size={23} color={colors.accent} /></View>
        <View style={styles.storyContextCopy}><AppText muted style={styles.eyebrow}>القصة</AppText><AppText weight="semibold" style={styles.storyCaption} numberOfLines={2}>{context.storyCaption?.trim() || 'قصة بدون تعليق'}</AppText>{createdLabel ? <AppText muted style={styles.createdText}>نُشرت {createdLabel}</AppText> : null}</View>
        <View style={styles.countBubble}><AppText weight="bold" style={styles.countValue}>{context.viewers.length}</AppText><AppText muted style={styles.countLabel}>مشاهد</AppText></View>
      </View>

      {!context.viewers.length ? (
        <View style={styles.emptyPanel}><View style={styles.emptyIcon}><Ionicons name="eye-off-outline" size={27} color={colors.primary} /></View><AppText weight="bold" style={styles.emptyTitle}>لسه محدش شاف القصة</AppText><AppText muted style={styles.emptyText}>أول ما تبدأ المشاهدات هتظهر الحسابات هنا بالترتيب.</AppText><AppButton label="العودة لقصصي" variant="neutral" onPress={() => router.replace('/story/manage')} /></View>
      ) : (
        <View style={styles.viewerList}>
          {context.viewers.map((viewer, index) => {
            const name = viewer.displayName ?? viewer.username ?? 'مستخدم';
            const initial = name.charAt(0).toUpperCase();
            return (
              <Pressable key={`${viewer.viewerId}-${viewer.viewedAt}`} accessibilityRole="button" accessibilityLabel={`فتح ملف ${name}`} onPress={() => router.push(`/profile/${viewer.viewerId}`)} style={({ pressed }) => [styles.viewerRow, index === context.viewers.length - 1 && styles.viewerRowLast, pressed && styles.pressed]}>
                <View style={styles.avatarWrap}>{viewer.avatarUrl ? <ExpoImage source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" /> : <AppText weight="bold" style={styles.avatarInitial}>{initial}</AppText>}</View>
                <View style={styles.viewerMeta}><AppText weight="semibold" style={styles.viewerName}>{name}</AppText>{viewer.username ? <AppText muted style={styles.username}>@{viewer.username}</AppText> : null}<View style={styles.timeRow}><Ionicons name="eye-outline" size={13} color={colors.textMuted} /><AppText muted style={styles.viewedAt}>{formatViewedAt(viewer.viewedAt)}</AppText></View></View>
                <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.note}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText muted style={styles.noteText}>القائمة دي متاحة لصاحب القصة فقط، وبتعرض المشاهدات المسجلة للقصة الحالية.</AppText></View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'right' },
  subtitle: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  storyContext: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  storyIcon: { width: 48, height: 48, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  storyContextCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  storyCaption: { fontSize: 14, lineHeight: 19, textAlign: 'right' },
  createdText: { fontSize: 10 },
  countBubble: { minWidth: 64, minHeight: 64, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  countValue: { fontSize: 20, color: colors.primary },
  countLabel: { fontSize: 9 },
  viewerList: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  viewerRow: { minHeight: 76, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewerRowLast: { borderBottomWidth: 0 },
  avatarWrap: { width: 48, height: 48, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarInitial: { color: colors.primary, fontSize: 17 },
  viewerMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  viewerName: { fontSize: 14 },
  username: { fontSize: 10 },
  timeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  viewedAt: { fontSize: 9 },
  emptyPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  note: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  noteText: { flex: 1, fontSize: 11, lineHeight: 18, textAlign: 'right' },
  stateStack: { gap: spacing.sm },
  loadingStack: { gap: spacing.md },
  loadingHeader: { height: 90, borderRadius: radii.xl, backgroundColor: '#EEE7DF' },
  loadingRow: { height: 76, borderRadius: radii.lg, backgroundColor: '#F3E7DB' },
  pressed: { opacity: 0.72 },
});
