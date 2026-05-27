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
import { useAuth } from '@/lib/auth';
import { fetchMyDirectConversations, type DirectConversationSummary } from '@/lib/direct-messages';
import { AppButton } from '@/components/ui/AppButton';
import { acceptDirectMessageRequest, ignoreDirectMessageRequest } from '@/lib/direct-messages';
import { fetchStreamChatToken } from '@/lib/chat/stream-token';
import { getStreamDirectChannelConfig } from '@/lib/chat/stream-direct-mapping';

type InboxFilter = 'all' | 'requested' | 'accepted';

const FILTER_LABELS: Record<InboxFilter, string> = { all: 'الكل', requested: 'الطلبات', accepted: 'المقبولة' };
const STATUS_META: Record<string, { label: string; tone: 'neutral' | 'highlight' | 'warn' }> = {
  accepted: { label: 'مقبول', tone: 'highlight' },
  requested: { label: 'طلب جديد', tone: 'warn' },
  ignored: { label: 'تم التجاهل', tone: 'neutral' },
  blocked: { label: 'محظور', tone: 'neutral' },
  pending: { label: 'في الانتظار', tone: 'neutral' },
};


function getLastMessagePreview(body: string | null): string {
  const trimmed = body?.trim();
  if (!trimmed) return 'ابدأ المحادثة';
  if (trimmed === 'رسالة صوتية') return 'رسالة صوتية';
  // TODO: when direct conversation summary includes explicit message/attachment type, map image/video/file/exchange-draft previews here.
  return trimmed;
}

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getConversationSortTimestamp(item: DirectConversationSummary): number {
  const ms = item.lastMessageAt ? Date.parse(item.lastMessageAt) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function mapStreamMessagePreview(message: any): string | null {
  const metaType = typeof message?.teswa_type === 'string' ? message.teswa_type : '';
  if (metaType === 'exchange_offer_draft' || metaType === 'exchange_draft') return 'عرض تبادل مبدئي';
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.some((a) => typeof a?.mime_type === 'string' && a.mime_type.startsWith('audio/'))) return 'رسالة صوتية';
  if (attachments.some((a) => a?.type === 'image')) return 'صورة';
  if (attachments.some((a) => a?.type === 'video')) return 'فيديو';
  if (attachments.some((a) => a?.type === 'file')) return 'ملف';
  if (typeof message?.text === 'string' && message.text.trim().length > 0) return message.text.trim();
  return null;
}

async function mergeAcceptedStreamActivity(
  rows: DirectConversationSummary[],
  currentUserId: string,
): Promise<DirectConversationSummary[]> {
  const acceptedRows = rows.filter((row) => row.status === 'accepted');
  if (!acceptedRows.length) return rows;

  const tokenResult = await fetchStreamChatToken();
  if (!tokenResult.ok) return rows;

  const { StreamChat } = await import('stream-chat');
  const client = StreamChat.getInstance(tokenResult.apiKey);
  const alreadyConnectedUser = typeof client.userID === 'string' ? client.userID : null;
  const shouldConnect = !alreadyConnectedUser || alreadyConnectedUser !== tokenResult.userId;
  if (shouldConnect) {
    if (alreadyConnectedUser && typeof client.disconnectUser === 'function') await client.disconnectUser();
    await client.connectUser({ id: tokenResult.userId }, tokenResult.token);
  }

  const mergedById = new Map(rows.map((row) => [row.conversationId, row]));
  await Promise.all(acceptedRows.map(async (row) => {
    try {
      const config = getStreamDirectChannelConfig({
        conversationId: row.conversationId,
        currentUserId,
        otherUserId: row.otherUserId,
      });
      const channel = client.channel(config.type, config.id, { members: config.members });
      const state = await channel.query({ messages: { limit: 1 } });
      const latest = Array.isArray(state?.messages) ? state.messages[state.messages.length - 1] : null;
      if (!latest) return;
      const preview = mapStreamMessagePreview(latest);
      const createdAt = typeof latest.created_at === 'string' ? latest.created_at : null;
      const updatedAt = typeof latest.updated_at === 'string' ? latest.updated_at : null;
      const lastMessageAt = createdAt ?? updatedAt ?? row.lastMessageAt;
      const unreadCount = typeof channel.countUnread === 'function' ? channel.countUnread() : row.unreadCount;
      mergedById.set(row.conversationId, {
        ...row,
        lastMessageBody: preview ?? row.lastMessageBody,
        lastMessageAt,
        unreadCount: Number.isFinite(unreadCount) ? Math.max(0, unreadCount) : row.unreadCount,
      });
    } catch {
      // Keep Supabase fallback per-conversation.
    }
  }));

  return Array.from(mergedById.values()).sort((a, b) => getConversationSortTimestamp(b) - getConversationSortTimestamp(a));
}

export default function DirectInboxScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [items, setItems] = useState<DirectConversationSummary[]>([]);
  const [requestBusyById, setRequestBusyById] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const rows = await fetchMyDirectConversations();
      const hydratedRows = user?.id ? await mergeAcceptedStreamActivity(rows, user.id) : rows;
      setItems(hydratedRows);
      setError(null);
    } catch {
      setError('تعذر تحميل المحادثات حالياً.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.id]);

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

        {!loading && !error && filter === 'requested' ? (
          <AppCard>
            <View style={styles.requestCenterInfo}>
              <AppText weight="bold">طلبات المراسلة</AppText>
              <AppText muted>الطلبات دي من أشخاص لسه ما بدأش بينكم شات مباشر. اقبل الطلب لو حابب تكملوا الكلام.</AppText>
              <Pressable onPress={() => router.push('/settings/direct-privacy')}>
                <AppText muted style={styles.privacyHint}>تقدر تتحكم في مين يبعتلك من إعدادات خصوصية الرسائل.</AppText>
              </Pressable>
            </View>
          </AppCard>
        ) : null}

        {!loading && !error && feedback ? (
          <AppCard><AppText muted>{feedback}</AppText></AppCard>
        ) : null}

        {!loading && !error && !filtered.length ? (
          <AppCard>
            <EmptyState title={filter === 'requested' ? 'مفيش طلبات مراسلة' : 'لسه مفيش محادثات'} description={filter === 'requested' ? 'أي طلب جديد هيظهر هنا قبل ما يتحول لمحادثة مباشرة.' : 'لما تبدأ تبادل أو حد يبعتلك طلب، هتلاقي المحادثات هنا.'} />
          </AppCard>
        ) : null}

        {!loading && !error ? (
          <View style={styles.list}>
            {filtered.map((item) => {
              const status = STATUS_META[item.status] ?? { label: 'في الانتظار', tone: 'neutral' as const };
              const openable = item.status === 'accepted' || item.status === 'requested';
              const preview = getLastMessagePreview(item.lastMessageBody);
              const isRequested = item.status === 'requested';
              const isRequester = !!user?.id && !!item.requestedBy && item.requestedBy === user.id;
              const isReceiver = isRequested && !isRequester;
              const requestHint = isRequested ? (isReceiver ? 'اقبل الطلب لو حابب تفتح المحادثة.' : 'مستني قبول الطرف التاني.') : null;
              const requestChip = isRequested ? (isReceiver ? 'طلب جديد' : 'في الانتظار') : status.label;
              const isRowBusy = !!requestBusyById[item.conversationId];
              return (
                <Pressable key={item.conversationId} onPress={() => openConversation(item)} disabled={!openable} style={[styles.rowCard, !openable && styles.rowDisabled]}>
                  <View style={styles.rowTop}>
                    {item.otherAvatarUrl ? <Image source={{ uri: item.otherAvatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{(item.otherDisplayName?.[0] || item.otherUsername?.[0] || 'ت').toUpperCase()}</AppText></View>}
                    <View style={styles.nameBlock}>
                      <AppText weight="semibold" numberOfLines={1}>{item.otherDisplayName || 'مستخدم تِسوى'}</AppText>
                      {item.otherUsername ? <AppText muted numberOfLines={1}>@{item.otherUsername}</AppText> : null}
                    </View>
                    <View style={[styles.statusChip, status.tone === 'highlight' ? styles.statusHighlight : status.tone === 'warn' ? styles.statusWarn : null]}>
                      <AppText style={styles.statusText}>{requestChip}</AppText>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <AppText muted numberOfLines={1} style={styles.preview}>{preview}</AppText>
                    <View style={styles.trailingMeta}>
                      {item.unreadCount > 0 ? <View style={styles.unreadBadge}><AppText style={styles.unreadText}>{item.unreadCount > 99 ? '+99' : item.unreadCount}</AppText></View> : null}
                      {item.lastMessageAt ? <AppText muted style={styles.timeText}>{formatTime(item.lastMessageAt)}</AppText> : null}
                    </View>
                  </View>
                  {requestHint ? <AppText muted style={styles.requestHint}>{requestHint}</AppText> : null}
                  {filter === 'requested' && isReceiver ? (
                    <View style={styles.inlineActions}>
                      <AppButton
                        label={isRowBusy ? 'جاري التنفيذ...' : 'قبول'}
                        disabled={isRowBusy}
                        onPress={async () => {
                          setRequestBusyById((prev) => ({ ...prev, [item.conversationId]: true }));
                          try {
                            const result = await acceptDirectMessageRequest(item.conversationId);
                            if (!result.ok) { setFeedback('تعذر تنفيذ الطلب حالياً.'); return; }
                            setFeedback('تم قبول الطلب.');
                            await load({ silent: true });
                          } catch {
                            setFeedback('تعذر تنفيذ الطلب حالياً.');
                          } finally {
                            setRequestBusyById((prev) => ({ ...prev, [item.conversationId]: false }));
                          }
                        }}
                      />
                      <AppButton
                        label={isRowBusy ? 'جاري التنفيذ...' : 'تجاهل'}
                        variant="neutral"
                        disabled={isRowBusy}
                        onPress={async () => {
                          setRequestBusyById((prev) => ({ ...prev, [item.conversationId]: true }));
                          try {
                            const result = await ignoreDirectMessageRequest(item.conversationId);
                            if (!result.ok) { setFeedback('تعذر تنفيذ الطلب حالياً.'); return; }
                            setFeedback('تم تجاهل الطلب.');
                            await load({ silent: true });
                          } catch {
                            setFeedback('تعذر تنفيذ الطلب حالياً.');
                          } finally {
                            setRequestBusyById((prev) => ({ ...prev, [item.conversationId]: false }));
                          }
                        }}
                      />
                    </View>
                  ) : null}
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
  requestCenterInfo: { gap: spacing.xs },
  privacyHint: { textDecorationLine: 'underline' },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTextBlock: { flex: 1, gap: spacing.xs },
  title: { fontSize: 20 },
  filterRow: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  filterChip: { borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterChipTextActive: { color: colors.primary },
  loadingWrap: { alignItems: 'center', gap: spacing.sm },
  errorWrap: { gap: spacing.sm },
  retryBtn: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  retryText: { color: colors.white },
  list: { gap: spacing.sm },
  rowCard: { borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  rowDisabled: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  nameBlock: { flex: 1, gap: 2 },
  statusChip: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.surface },
  statusHighlight: { backgroundColor: colors.primarySoft },
  statusWarn: { backgroundColor: '#fff5e6' },
  statusText: { fontSize: 12, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1 },
  trailingMeta: { alignItems: 'flex-end', gap: 4 },
  requestHint: { fontSize: 12 },
  inlineActions: { flexDirection: 'row-reverse', gap: spacing.xs },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 6 },
  unreadText: { color: colors.white, fontSize: 12 },
  timeText: { fontSize: 11 },
});
