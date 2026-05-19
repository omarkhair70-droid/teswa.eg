import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchOffersInbox, getOfferStatusLabel, OfferRowSummary } from '@/lib/offers';
import { DealConversation, fetchDealConversationsForUser } from '@/lib/messages';
import { getDealStatusLabel } from '@/lib/deals';
import { useUnreadBadges } from '@/lib/unread-badges';
import { ContextualConversationSummary, fetchContextualConversationSummariesForUser } from '@/lib/contextual-conversations';

type MessagesSection = 'chats' | 'replies' | 'offers';


function formatVoiceDuration(durationMs: number | null): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: 'عرض وارد' | 'عرض مرسل' }) {
  const hasDealChat = offer.status === 'accepted' && !!offer.dealId;

  return (
    <AppCard style={styles.offerCard}>
      <View style={styles.offerRow}>
        <Pressable onPress={() => router.push(`/offer/${offer.id}`)}>
          <View style={styles.offerRowSummary}>
            <View style={styles.offerHeader}>
              <View style={styles.offerLabelPill}><Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} /><AppText weight="semibold">{label}</AppText></View>
              <View style={styles.offerStatusPill}><AppText muted>{getOfferStatusLabel(offer.status)}</AppText></View>
            </View>
            <View style={styles.exchangeBlock}>
              <AppText muted>المطلوب</AppText>
              <AppText weight="semibold" numberOfLines={1}>{offer.requestedItem?.title ?? 'عنصر مطلوب غير متاح'}</AppText>
              <AppText muted numberOfLines={1}>مقابل: {offer.offeredItem?.title ?? 'عنصر معروض غير متاح'}</AppText>
            </View>
            {offer.createdAt ? <View style={styles.dateRow}><Ionicons name="time-outline" size={13} color={colors.textMuted} /><AppText muted>{new Date(offer.createdAt).toLocaleString('ar-EG')}</AppText></View> : null}
          </View>
        </Pressable>
        {hasDealChat ? <View style={styles.offerDealCta}><View style={styles.offerDealHead}><Ionicons name="chatbubbles-outline" size={15} color={colors.primary} /><AppText muted>تم قبول العرض وتحول إلى دردشة صفقة.</AppText></View><AppButton label="افتح الدردشة" variant="neutral" onPress={() => router.push(`/deal/${offer.dealId}`)} /></View> : null}
      </View>
    </AppCard>
  );
}

function DealRow({ convo }: { convo: DealConversation }) {
  const otherName = convo.otherParticipant.displayName?.trim() || 'محادثة صفقة';
  const fallbackLetter = otherName[0] || '؟';
  const latestPreview = convo.latestMessage
    ? `${convo.latestMessage.senderId === convo.otherParticipant.id ? `${otherName}: ` : 'أنت: '}${convo.latestMessage.messageType === 'voice' ? '🎤 رسالة صوتية' : convo.latestMessage.body}`
    : 'لسه مفيش رسائل — افتح الشات وابدأ التنسيق.';

  return (
    <Pressable onPress={() => router.push(`/deal/${convo.dealId}`)}>
      <AppCard style={styles.chatCard}>
        <View style={styles.chatRow}>
          <View style={styles.avatarWrap}>
            {convo.otherParticipant.avatarUrl ? (
              <Image source={{ uri: convo.otherParticipant.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}><AppText weight="semibold">{fallbackLetter}</AppText></View>
            )}
          </View>

          <View style={styles.chatMain}>
            <View style={styles.typeLabel}><Ionicons name="chatbubble-outline" size={13} color={colors.primary} /><AppText muted>دردشة صفقة</AppText></View>
            <AppText weight="semibold" numberOfLines={1}>{otherName}</AppText>
            <AppText muted numberOfLines={1}>{latestPreview}</AppText>
            <View style={styles.swapChip}><AppText muted numberOfLines={1}>{convo.requestedItemTitle} ↔ {convo.offeredItemTitle}</AppText></View>
            <View style={styles.dealStatusPill}><AppText muted>{getDealStatusLabel(convo.status)}</AppText></View>
          </View>

          <View style={styles.chatMeta}>
            <AppText muted>{new Date(convo.lastActivityAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
            {convo.unreadCount > 0 ? (
              <View style={styles.unreadBadge}><AppText weight="semibold" style={styles.unreadText}>{convo.unreadCount}</AppText></View>
            ) : null}
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}


function ReplyThreadRow({ thread }: { thread: ContextualConversationSummary }) {
  const otherName = thread.otherParticipant.displayName?.trim() || 'رد على قصة';
  const fallbackLetter = otherName[0] || '؟';
  const latestVoiceDuration = thread.latestMessage?.kind === 'voice' ? formatVoiceDuration(thread.latestMessage.durationMs) : null;
  const latestPreview = thread.latestMessage
    ? `${thread.latestMessage.senderId === thread.otherParticipant.id ? `${otherName}: ` : 'أنت: '}${thread.latestMessage.kind === 'voice'
      ? `رسالة صوتية${latestVoiceDuration ? ` • ${latestVoiceDuration}` : ''}`
      : thread.latestMessage.body}`
    : 'لسه مفيش رسائل.';

  return (
    <Pressable onPress={() => router.push(`/contextual/${thread.conversationId}`)}>
      <AppCard style={styles.replyCard}>
        <View style={styles.chatRow}>
          <View style={styles.avatarWrap}>
            {thread.otherParticipant.avatarUrl ? (
              <Image source={{ uri: thread.otherParticipant.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}><AppText weight="semibold">{fallbackLetter}</AppText></View>
            )}
          </View>

          <View style={styles.chatMain}>
            <AppText weight="semibold" numberOfLines={1}>{otherName}</AppText>
            <AppText muted numberOfLines={1}>{latestPreview}</AppText>
            <View style={styles.storyChip}><Ionicons name="sparkles-outline" size={12} color={colors.primary} /><AppText muted>رد على قصة</AppText></View>
          </View>

          <View style={styles.chatMeta}>
            <AppText muted>{new Date(thread.lastActivityAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</AppText>
            {thread.unreadCount > 0 ? (
              <View style={styles.unreadBadge}><AppText weight="semibold" style={styles.unreadText}>{thread.unreadCount}</AppText></View>
            ) : null}
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

export default function Screen() {
  const { user } = useAuth();
  const [selectedSection, setSelectedSection] = useState<MessagesSection>('chats');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<OfferRowSummary[]>([]);
  const [sent, setSent] = useState<OfferRowSummary[]>([]);
  const [conversations, setConversations] = useState<DealConversation[]>([]);
  const [replyThreads, setReplyThreads] = useState<ContextualConversationSummary[]>([]);
  const { refreshBadges } = useUnreadBadges();

  const offersCount = incoming.length + sent.length;

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [offersData, convosData, repliesData] = await Promise.all([
        fetchOffersInbox(user.id),
        fetchDealConversationsForUser(user.id),
        fetchContextualConversationSummariesForUser(user.id),
      ]);
      setIncoming(offersData.incomingActionableOffers);
      setSent(offersData.sentOffers);
      setConversations(convosData);
      setReplyThreads(repliesData);
      void refreshBadges();
    } catch {
      setError('تعذر تحميل الرسائل والعروض حالياً.');
    } finally {
      setLoading(false);
    }
  }, [refreshBadges, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const hasIncomingActionable = useMemo(() => incoming.length > 0, [incoming.length]);

  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض العروض والمحادثات." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="جاري التحميل" description="نحمّل الرسائل والعروض الآن." /></AppScreen>;
  if (error) return <AppScreen backgroundVariant="soft"><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.group}>
        <View style={styles.hero}>
          <View style={styles.heroOrbOne} />
          <View style={styles.heroOrbTwo} />
          <View style={styles.heroContent}>
            <View style={styles.heroIconShell}><Ionicons name="chatbubbles-outline" size={20} color={colors.primary} /></View>
            <AppText weight="bold" style={styles.title}>الرسائل</AppText>
            <AppText muted>دردشات الصفقات، ردود القصص، والعروض التي تنتظر قرارك — كلها في مكان واحد.</AppText>
            <AppText muted>{incoming.length > 0 ? `عندك ${incoming.length} عرضًا يحتاج ردك.` : 'تابع الحركة بهدوء، وكل جديد سيظهر هنا.'}</AppText>
          </View>
        </View>
        <View style={styles.pulseRow}>
          <View style={styles.pulseCard}><Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} /><AppText muted>دردشات الصفقات</AppText><AppText weight="semibold">{conversations.length}</AppText></View>
          <View style={styles.pulseCard}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><AppText muted>ردود القصص</AppText><AppText weight="semibold">{replyThreads.length}</AppText></View>
          <View style={styles.pulseCard}><Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} /><AppText muted>العروض</AppText><AppText weight="semibold">{offersCount}</AppText></View>
          {incoming.length > 0 ? <View style={styles.pulseCardAlert}><Ionicons name="alert-circle-outline" size={16} color="#B42318" /><AppText weight="semibold">{incoming.length} يحتاج قرارك</AppText></View> : null}
        </View>

        <View style={styles.segmentedWrap}>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'chats' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('chats')}
          >
            <View style={styles.segmentTextWrap}><Ionicons name="chatbubble-ellipses-outline" size={14} color={selectedSection === 'chats' ? colors.background : colors.textMuted} /><AppText weight="semibold" style={selectedSection === 'chats' ? styles.segmentTextActive : undefined}>الدردشات ({conversations.length})</AppText></View>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'replies' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('replies')}
          >
            <View style={styles.segmentTextWrap}><Ionicons name="sparkles-outline" size={14} color={selectedSection === 'replies' ? colors.background : colors.textMuted} /><AppText weight="semibold" style={selectedSection === 'replies' ? styles.segmentTextActive : undefined}>الردود ({replyThreads.length})</AppText></View>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'offers' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('offers')}
          >
            <View style={styles.offersLabelWrap}>
              <AppText weight="semibold" style={selectedSection === 'offers' ? styles.segmentTextActive : undefined}>العروض ({offersCount})</AppText>
              {hasIncomingActionable ? <View style={styles.attentionDot}><Ionicons name="flash" size={10} color={colors.background} /></View> : null}
            </View>
          </Pressable>
        </View>

        {selectedSection === 'chats' ? (
          conversations.length ? conversations.map((convo) => <DealRow key={convo.dealId} convo={convo} />) : <AppCard style={styles.emptyCard}><EmptyState title="لا توجد دردشات صفقات بعد" description="عند قبول أي عرض، ستظهر دردشة الصفقة هنا." /></AppCard>
        ) : selectedSection === 'replies' ? (
          replyThreads.length ? replyThreads.map((thread) => <ReplyThreadRow key={thread.conversationId} thread={thread} />) : <AppCard style={styles.emptyCard}><EmptyState title="لا توجد ردود قصص بعد" description="لما حد يرد على قصة أو ترد أنت على قصة، هتظهر المحادثات هنا." /></AppCard>
        ) : (
          <View style={styles.group}>
            <View style={styles.sectionGroup}>
              <View style={styles.sectionHeader}><View style={styles.sectionIconShell}><Ionicons name="alert-circle-outline" size={16} color="#B42318" /></View><View><AppText weight="semibold">عروض تحتاج ردك</AppText><AppText muted>راجع العروض الواردة واتخذ قرارك.</AppText></View></View>
              {incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <AppCard style={styles.emptyCard}><EmptyState title="لا توجد عروض تحتاج ردك" description="أي عرض جديد يحتاج قرارك سيظهر هنا." /></AppCard>}
            </View>

            <View style={styles.sectionGroup}>
              <View style={styles.sectionHeader}><View style={styles.sectionIconShell}><Ionicons name="paper-plane-outline" size={16} color={colors.primary} /></View><View><AppText weight="semibold">العروض التي أرسلتها</AppText></View></View>
              {sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : <AppCard style={styles.emptyCard}><EmptyState title="لم ترسل عروضًا بعد" description="أرسل أول عرض تبديل من صفحة أي عنصر." /></AppCard>}
            </View>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  sectionGroup: { gap: spacing.xs },
  title: { fontSize: 24 },
  hero: { borderRadius: radii.xl, padding: spacing.md, overflow: 'hidden', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  heroContent: { gap: spacing.xs },
  heroOrbOne: { position: 'absolute', width: 140, height: 140, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)', top: -50, left: -30 },
  heroOrbTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', bottom: -60, right: -30 },
  heroIconShell: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pulseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pulseCard: { backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: 2 },
  pulseCardAlert: { backgroundColor: '#FEE4E2', borderRadius: radii.lg, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: '#FDA29B', flexDirection: 'row', alignItems: 'center', gap: 6 },
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: radii.lg,
    padding: spacing.xs,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButton: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentTextActive: {
    color: colors.background,
  },
  offersLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attentionDot: {
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#B42318',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerCard: { borderWidth: 1, borderColor: colors.border },
  offerRow: { gap: spacing.xs },
  offerRowSummary: { gap: spacing.xs },
  offerDealCta: { gap: spacing.xs, backgroundColor: colors.primarySoft, borderRadius: radii.lg, padding: spacing.sm },
  offerDealHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offerLabelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  offerStatusPill: { backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  exchangeBlock: { gap: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatCard: { borderWidth: 1, borderColor: colors.border },
  replyCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF8ED' },
  chatRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatMain: {
    flex: 1,
    gap: 4,
  },
  swapChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  typeLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  dealStatusPill: { alignSelf: 'flex-end', backgroundColor: colors.surface, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  storyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF0C7', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: 'flex-end' },
  chatMeta: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.background,
    fontSize: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionIconShell: { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border },
});
