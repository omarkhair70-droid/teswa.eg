import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchMyDirectConversations, type DirectConversationSummary } from '@/lib/direct-messages';

type InboxFilter = 'all' | 'requested' | 'accepted';

const FILTER_LABELS: Record<InboxFilter, string> = { all: 'الكل', requested: 'الطلبات', accepted: 'المقبولة' };
const STATUS_META: Record<string, { label: string; tone: 'neutral' | 'highlight' | 'warn' }> = {
  accepted: { label: 'مقبول', tone: 'highlight' },
  requested: { label: 'طلب جديد', tone: 'warn' },
  ignored: { label: 'تم التجاهل', tone: 'neutral' },
  blocked: { label: 'محظور', tone: 'neutral' },
  pending: { label: 'في الانتظار', tone: 'neutral' },
};

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function DirectInboxScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [items, setItems] = useState<DirectConversationSummary[]>([]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const rows = await fetchMyDirectConversations();
      setItems(rows);
      setError(null);
    } catch {
      setError('تعذر تحميل المحادثات حالياً.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'requested') return item.status === 'requested';
    if (filter === 'accepted') return item.status === 'accepted';
    return true;
  }), [filter, items]);

  const openConversation = useCallback((item: DirectConversationSummary) => {
    if (item.status !== 'accepted' && item.status !== 'requested') return;
    router.push(`/direct/${item.conversationId}`);
  }, []);

  return (
    <AppScreen scrollable>
      <View style={styles.root}>
        <AppCard>
          <View style={styles.heroRow}>
            <View style={styles.heroTextBlock}>
              <AppText weight="bold" style={styles.title}>الرسائل المباشرة</AppText>
              <AppText muted>كل محادثاتك في مكان واحد بتصميم هادئ وواضح.</AppText>
            </View>
          </View>
          <View style={styles.filterRow}>
            {(['all', 'requested', 'accepted'] as InboxFilter[]).map((key) => {
              const active = filter === key;
              return <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filterChip, active && styles.filterChipActive]}><AppText weight={active ? 'semibold' : 'regular'} style={active ? styles.filterChipTextActive : undefined}>{FILTER_LABELS[key]}</AppText></Pressable>;
            })}
          </View>
        </AppCard>

        {loading ? (
          <AppCard>
            <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} /><AppText muted>جاري تحميل المحادثات...</AppText></View>
          </AppCard>
        ) : null}

        {!loading && error ? (
          <AppCard>
            <View style={styles.errorWrap}>
              <AppText weight="semibold">تعذر تحميل المحادثات حالياً.</AppText>
              <Pressable onPress={() => void load()} style={styles.retryBtn}><AppText style={styles.retryText}>إعادة المحاولة</AppText></Pressable>
            </View>
          </AppCard>
        ) : null}

        {!loading && !error && !filtered.length ? (
          <AppCard>
            <EmptyState title="لسه مفيش محادثات" description="لما تبدأ تبادل أو حد يبعتلك طلب، هتلاقي المحادثات هنا." />
          </AppCard>
        ) : null}

        {!loading && !error ? (
          <View style={styles.list}>
            {filtered.map((item) => {
              const status = STATUS_META[item.status] ?? { label: 'في الانتظار', tone: 'neutral' as const };
              const openable = item.status === 'accepted' || item.status === 'requested';
              const preview = item.lastMessageBody?.trim() ? item.lastMessageBody : 'ابدأ المحادثة';
              return (
                <Pressable key={item.conversationId} onPress={() => openConversation(item)} disabled={!openable} style={[styles.rowCard, !openable && styles.rowDisabled]}>
                  <View style={styles.rowTop}>
                    {item.otherAvatarUrl ? <Image source={{ uri: item.otherAvatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{(item.otherDisplayName?.[0] || item.otherUsername?.[0] || 'ت').toUpperCase()}</AppText></View>}
                    <View style={styles.nameBlock}>
                      <AppText weight="semibold" numberOfLines={1}>{item.otherDisplayName || 'مستخدم تِسوى'}</AppText>
                      {item.otherUsername ? <AppText muted numberOfLines={1}>@{item.otherUsername}</AppText> : null}
                    </View>
                    <View style={[styles.statusChip, status.tone === 'highlight' ? styles.statusHighlight : status.tone === 'warn' ? styles.statusWarn : null]}>
                      <AppText style={styles.statusText}>{status.label}</AppText>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <AppText muted numberOfLines={1} style={styles.preview}>{preview}</AppText>
                    <View style={styles.trailingMeta}>
                      {item.unreadCount > 0 ? <View style={styles.unreadBadge}><AppText style={styles.unreadText}>{item.unreadCount > 99 ? '+99' : item.unreadCount}</AppText></View> : null}
                      {item.lastMessageAt ? <AppText muted style={styles.timeText}>{formatTime(item.lastMessageAt)}</AppText> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTextBlock: { flex: 1, gap: spacing.xs },
  title: { fontSize: 20 },
  filterRow: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  filterChip: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterChipTextActive: { color: colors.primary },
  loadingWrap: { alignItems: 'center', gap: spacing.sm },
  errorWrap: { gap: spacing.sm },
  retryBtn: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  retryText: { color: colors.white },
  list: { gap: spacing.sm },
  rowCard: { borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  rowDisabled: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  nameBlock: { flex: 1, gap: 2 },
  statusChip: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.surfaceMuted },
  statusHighlight: { backgroundColor: colors.primarySoft },
  statusWarn: { backgroundColor: '#fff5e6' },
  statusText: { fontSize: 12, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1 },
  trailingMeta: { alignItems: 'flex-end', gap: 4 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 6 },
  unreadText: { color: colors.white, fontSize: 12 },
  timeText: { fontSize: 11 },
});
