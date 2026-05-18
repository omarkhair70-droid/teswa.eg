import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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

function OfferRow({ offer, label }: { offer: OfferRowSummary; label: 'عرض وارد' | 'عرض مرسل' }) {
  const hasDealChat = offer.status === 'accepted' && !!offer.dealId;

  return (
    <AppCard>
      <View style={styles.offerRow}>
        <Pressable onPress={() => router.push(`/offer/${offer.id}`)}>
          <View style={styles.offerRowSummary}>
            <View style={styles.offerHeader}>
              <AppText weight="semibold">{label}</AppText>
              <AppText muted>{getOfferStatusLabel(offer.status)}</AppText>
            </View>
            <AppText weight="semibold" numberOfLines={1}>{offer.requestedItem?.title ?? 'عنصر مطلوب غير متاح'}</AppText>
            <AppText muted numberOfLines={1}>مقابل: {offer.offeredItem?.title ?? 'عنصر معروض غير متاح'}</AppText>
            {offer.createdAt ? <AppText muted>{new Date(offer.createdAt).toLocaleString('ar-EG')}</AppText> : null}
          </View>
        </Pressable>
        {hasDealChat ? <View style={styles.offerDealCta}><AppText muted>تم قبول العرض وتحول إلى دردشة صفقة.</AppText><AppButton label="افتح الدردشة" variant="neutral" onPress={() => router.push(`/deal/${offer.dealId}`)} /></View> : null}
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
      <AppCard>
        <View style={styles.chatRow}>
          <View style={styles.avatarWrap}>
            {convo.otherParticipant.avatarUrl ? (
              <Image source={{ uri: convo.otherParticipant.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}><AppText weight="semibold">{fallbackLetter}</AppText></View>
            )}
          </View>

          <View style={styles.chatMain}>
            <AppText weight="semibold" numberOfLines={1}>{otherName}</AppText>
            <AppText muted numberOfLines={1}>{latestPreview}</AppText>
            <View style={styles.swapChip}><AppText muted numberOfLines={1}>{convo.requestedItemTitle} ↔ {convo.offeredItemTitle}</AppText></View>
            <AppText muted>{getDealStatusLabel(convo.status)}</AppText>
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
  const latestPreview = thread.latestMessage
    ? `${thread.latestMessage.senderId === thread.otherParticipant.id ? `${otherName}: ` : 'أنت: '}${thread.latestMessage.body}`
    : 'لسه مفيش رسائل.';

  return (
    <Pressable onPress={() => router.push(`/contextual/${thread.conversationId}`)}>
      <AppCard>
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
            <View style={styles.swapChip}><AppText muted>رد على قصة</AppText></View>
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

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك لعرض العروض والمحادثات." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل الرسائل والعروض الآن." /></AppScreen>;
  if (error) return <AppScreen><View style={styles.group}><EmptyState title="حدث خطأ" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return (
    <AppScreen scrollable>
      <View style={styles.group}>
        <AppText weight="bold" style={styles.title}>الرسائل</AppText>
        <AppText muted>تابع دردشات الصفقات، ردود القصص، والعروض من مكان واحد.</AppText>

        <View style={styles.segmentedWrap}>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'chats' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('chats')}
          >
            <AppText weight="semibold" style={selectedSection === 'chats' ? styles.segmentTextActive : undefined}>الدردشات ({conversations.length})</AppText>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'replies' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('replies')}
          >
            <AppText weight="semibold" style={selectedSection === 'replies' ? styles.segmentTextActive : undefined}>الردود ({replyThreads.length})</AppText>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, selectedSection === 'offers' && styles.segmentButtonActive]}
            onPress={() => setSelectedSection('offers')}
          >
            <View style={styles.offersLabelWrap}>
              <AppText weight="semibold" style={selectedSection === 'offers' ? styles.segmentTextActive : undefined}>العروض ({offersCount})</AppText>
              {hasIncomingActionable ? <View style={styles.attentionDot} /> : null}
            </View>
          </Pressable>
        </View>

        {selectedSection === 'chats' ? (
          conversations.length ? conversations.map((convo) => <DealRow key={convo.dealId} convo={convo} />) : <EmptyState title="لا توجد دردشات صفقات بعد" description="عند قبول أي عرض، ستظهر دردشة الصفقة هنا." />
        ) : selectedSection === 'replies' ? (
          replyThreads.length ? replyThreads.map((thread) => <ReplyThreadRow key={thread.conversationId} thread={thread} />) : <EmptyState title="لا توجد ردود قصص بعد" description="لما حد يرد على قصة أو ترد أنت على قصة، هتظهر المحادثات هنا." />
        ) : (
          <View style={styles.group}>
            <View style={styles.sectionGroup}>
              <AppText weight="semibold">عروض تحتاج ردك</AppText>
              <AppText muted>راجع العروض الواردة واتخذ قرارك.</AppText>
              {incoming.length ? incoming.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض وارد" />) : <EmptyState title="لا توجد عروض تحتاج ردك" description="أي عرض جديد يحتاج قرارك سيظهر هنا." />}
            </View>

            <View style={styles.sectionGroup}>
              <AppText weight="semibold">العروض التي أرسلتها</AppText>
              {sent.length ? sent.map((offer) => <OfferRow key={offer.id} offer={offer} label="عرض مرسل" />) : <EmptyState title="لم ترسل عروضًا بعد" description="أرسل أول عرض تبديل من صفحة أي عنصر." />}
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
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xs,
    gap: spacing.xs,
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
  segmentTextActive: {
    color: colors.background,
  },
  offersLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attentionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#B42318',
  },
  offerRow: { gap: spacing.xs },
  offerRowSummary: { gap: spacing.xs },
  offerDealCta: { gap: spacing.xs },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 42,
    height: 42,
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
});
