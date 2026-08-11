import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import {
  acceptDirectMessageRequest,
  fetchMyDirectConversations,
  ignoreDirectMessageRequest,
  type DirectConversationSummary,
} from '@/lib/direct-messages';

type InboxFilter = 'all' | 'requested' | 'accepted';

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'requested', label: 'الطلبات' },
  { key: 'accepted', label: 'المحادثات' },
];

function getLastMessagePreview(body: string | null) {
  return body?.trim() || 'ابدأ المحادثة';
}

function formatTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

export default function DirectInboxScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [items, setItems] = useState<DirectConversationSummary[]>([]);
  const [requestBusyById, setRequestBusyById] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const rows = await fetchMyDirectConversations();
      setItems(rows);
      setError(null);
    } catch {
      setError('تعذر تحميل المحادثات حالياً.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const visibleItems = useMemo(
    () => items.filter((item) => item.status === 'requested' || item.status === 'accepted'),
    [items],
  );

  const counts = useMemo(() => ({
    requests: visibleItems.filter((item) => item.status === 'requested').length,
    accepted: visibleItems.filter((item) => item.status === 'accepted').length,
    unread: visibleItems.reduce((sum, item) => sum + Math.max(0, item.unreadCount), 0),
  }), [visibleItems]);

  const filtered = useMemo(
    () => visibleItems.filter((item) =>
      filter === 'requested' ? item.status === 'requested' : filter === 'accepted' ? item.status === 'accepted' : true,
    ),
    [filter, visibleItems],
  );

  const runRequestAction = useCallback(async (item: DirectConversationSummary, action: 'accept' | 'ignore') => {
    setRequestBusyById((previous) => ({ ...previous, [item.conversationId]: true }));
    setFeedback(null);
    try {
      const result = action === 'accept'
        ? await acceptDirectMessageRequest(item.conversationId)
        : await ignoreDirectMessageRequest(item.conversationId);
      if (!result.ok) {
        setFeedback('تعذر تنفيذ الطلب حالياً.');
        return;
      }
      setFeedback(action === 'accept' ? 'تم قبول الطلب.' : 'تم تجاهل الطلب.');
      await load('silent');
    } catch {
      setFeedback('تعذر تنفيذ الطلب حالياً.');
    } finally {
      setRequestBusyById((previous) => ({ ...previous, [item.conversationId]: false }));
    }
  }, [load]);

  if (!user) {
    return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض الرسائل المباشرة." /></AppScreen>;
  }

  return (
    <AppScreen scrollable backgroundVariant="soft">
      <View style={styles.root}>
        <AppFadeIn>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText muted style={styles.eyebrow}>المراسلة المباشرة</AppText>
              <AppText weight="bold" style={styles.title}>طلباتك ومحادثاتك</AppText>
              <AppText muted style={styles.subtitle}>راجع الطلبات الجديدة، وارجع للمحادثات المقبولة بسرعة.</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تحديث الرسائل المباشرة"
              disabled={refreshing}
              onPress={() => void load('refresh')}
              style={styles.refreshButton}
            >
              {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={20} color={colors.primary} />}
            </Pressable>
          </View>
        </AppFadeIn>

        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.unread}</AppText><AppText muted style={styles.summaryLabel}>غير مقروء</AppText></View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.requests}</AppText><AppText muted style={styles.summaryLabel}>طلبات</AppText></View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.accepted}</AppText><AppText muted style={styles.summaryLabel}>محادثات</AppText></View>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((entry) => {
            const active = filter === entry.key;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(entry.key)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <AppText weight="semibold" style={active ? styles.filterTextActive : styles.filterText}>{entry.label}</AppText>
              </Pressable>
            );
          })}
        </View>

        {filter === 'requested' ? (
          <AppCard style={styles.requestInfo}>
            <View style={styles.requestInfoHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
              <AppText weight="bold">طلبات المراسلة</AppText>
            </View>
            <AppText muted>اقبل الطلب علشان تبدأ المحادثة، أو تجاهله من غير ما تفتح قناة جديدة.</AppText>
            <Pressable onPress={() => router.push('/settings/direct-privacy')}>
              <AppText weight="semibold" style={styles.privacyLink}>راجع خصوصية الرسائل</AppText>
            </Pressable>
          </AppCard>
        ) : null}

        {feedback ? <View style={styles.feedback}><Ionicons name="information-circle-outline" size={17} color={colors.accent} /><AppText style={styles.feedbackText}>{feedback}</AppText></View> : null}
        {error && visibleItems.length ? <View style={styles.errorBanner}><AppText style={styles.errorText}>{error}</AppText><Pressable onPress={() => void load('refresh')}><AppText weight="semibold" style={styles.retryText}>حاول تاني</AppText></Pressable></View> : null}

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /><AppText muted>بنحدّث الرسائل المباشرة...</AppText></View>
        ) : error && !visibleItems.length ? (
          <AppCard><EmptyState title="تعذر تحميل الرسائل" description={error} /><AppButton label="إعادة المحاولة" onPress={() => void load()} /></AppCard>
        ) : !filtered.length ? (
          <AppCard>
            <EmptyState
              title={filter === 'requested' ? 'مفيش طلبات مراسلة' : 'لسه مفيش محادثات هنا'}
              description={filter === 'requested' ? 'أي طلب جديد هيظهر هنا قبل ما يتحول لمحادثة.' : 'ابدأ مراسلة من بروفايل مستخدم، وهتظهر هنا.'}
            />
          </AppCard>
        ) : (
          <View style={styles.list}>
            {filtered.map((item) => {
              const isRequested = item.status === 'requested';
              const isRequester = item.requestedBy === user.id;
              const canRespond = isRequested && !isRequester;
              const canOpen = item.status === 'accepted' || item.status === 'requested';
              const busy = !!requestBusyById[item.conversationId];
              const label = item.status === 'accepted' ? 'محادثة' : isRequester ? 'في الانتظار' : 'طلب جديد';

              return (
                <Pressable
                  key={item.conversationId}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canOpen }}
                  disabled={!canOpen}
                  onPress={() => { if (canOpen) router.push(`/direct/${item.conversationId}`); }}
                  style={({ pressed }) => [styles.row, item.unreadCount > 0 && styles.rowUnread, pressed && styles.pressed]}
                >
                  <View style={styles.avatarWrap}>
                    {item.otherAvatarUrl ? <Image source={{ uri: item.otherAvatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{(item.otherDisplayName?.[0] || item.otherUsername?.[0] || 'ت').toUpperCase()}</AppText></View>}
                    {item.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <View style={styles.rowMain}>
                    <View style={styles.rowHeader}>
                      <AppText weight={item.unreadCount > 0 ? 'bold' : 'semibold'} numberOfLines={1} style={styles.name}>{item.otherDisplayName || 'مستخدم تِسوى'}</AppText>
                      <AppText muted style={styles.time}>{formatTime(item.lastMessageAt)}</AppText>
                    </View>
                    {item.otherUsername ? <AppText muted numberOfLines={1} style={styles.username}>@{item.otherUsername}</AppText> : null}
                    <AppText muted={item.unreadCount === 0} numberOfLines={1} style={styles.preview}>{getLastMessagePreview(item.lastMessageBody)}</AppText>
                    <View style={styles.rowFooter}>
                      <View style={[styles.statusPill, isRequested && styles.statusPillRequest]}><AppText weight="semibold" style={[styles.statusText, isRequested && styles.statusTextRequest]}>{label}</AppText></View>
                      {item.unreadCount > 0 ? <View style={styles.unreadBadge}><AppText weight="bold" style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</AppText></View> : null}
                    </View>
                    {canRespond ? (
                      <View style={styles.actions}>
                        <AppButton label={busy ? 'جاري التنفيذ...' : 'قبول'} disabled={busy} onPress={() => void runRequestAction(item, 'accept')} />
                        <AppButton label="تجاهل" variant="neutral" disabled={busy} onPress={() => void runRequestAction(item, 'ignore')} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  subtitle: { textAlign: 'right', lineHeight: 20 },
  refreshButton: { width: 42, height: 42, borderRadius: radii.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  summaryStrip: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 20 },
  summaryLabel: { fontSize: 11 },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  filters: { flexDirection: 'row-reverse', gap: spacing.xs, backgroundColor: colors.primarySoft, padding: spacing.xs, borderRadius: radii.lg },
  filter: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  filterActive: { backgroundColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13 },
  filterTextActive: { color: colors.background, fontSize: 13 },
  requestInfo: { gap: spacing.sm },
  requestInfoHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  privacyLink: { color: colors.primary, textAlign: 'right' },
  feedback: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.accentSoft },
  feedbackText: { flex: 1, textAlign: 'right' },
  errorBanner: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  errorText: { flex: 1, textAlign: 'right' },
  retryText: { color: colors.primary },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  rowUnread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.82 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  unreadDot: { position: 'absolute', left: 1, bottom: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface },
  rowMain: { flex: 1, gap: 4 },
  rowHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, textAlign: 'right' },
  time: { fontSize: 11 },
  username: { textAlign: 'right', fontSize: 12 },
  preview: { textAlign: 'right', lineHeight: 19 },
  rowFooter: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  statusPillRequest: { backgroundColor: colors.accentSoft },
  statusText: { color: colors.primary, fontSize: 11 },
  statusTextRequest: { color: colors.accent, fontSize: 11 },
  unreadBadge: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  unreadBadgeText: { color: colors.background, fontSize: 11 },
  actions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.sm },
});
