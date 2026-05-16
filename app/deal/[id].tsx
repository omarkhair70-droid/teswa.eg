import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { confirmDealCompletedFromMobile, fetchDealRoomById, getDealStatusLabel, getDealStatusNextStep, markDealThreadReadFromMobile, sendDealMessageFromMobile } from '@/lib/deals';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { useUnreadBadges } from '@/lib/unread-badges';

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<any>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const messageIdsRef = useRef<Set<string>>(new Set());
  const { refreshBadges } = useUnreadBadges();

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDealRoomById(id, user.id);
      if (!result.ok) {
        setDeal(null);
        setError(result.reason === 'unauthorized' ? 'غير مسموح لك بعرض هذه الصفقة.' : 'الصفقة غير موجودة.');
      } else {
        setDeal(result.deal);
        messageIdsRef.current = new Set(result.deal.messages.map((m: any) => m.id));
        void markDealThreadReadFromMobile(id).finally(() => {
          void refreshBadges();
        });
      }
    } catch (err) {
      if (__DEV__) console.log('[deal-room] load failed', { dealId: id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تحميل بيانات الصفقة.');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, refreshBadges]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!id || !user?.id) return;
    const channel = supabase
      .channel(`deal_messages_${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deal_messages', filter: `deal_id=eq.${id}` }, (payload) => {
        const row = payload.new as any;
        if (messageIdsRef.current.has(row.id as string)) return;
        messageIdsRef.current.add(row.id as string);
        setDeal((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, { id: row.id, dealId: row.deal_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at }],
          };
        });
        if ((row.sender_id as string) !== user.id) {
          void markDealThreadReadFromMobile(id).finally(() => {
            void refreshBadges();
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('unavailable');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, refreshBadges, user?.id]);

  const sendMessage = useCallback(async () => {
    if (!deal || !user?.id) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendDealMessageFromMobile({ dealId: deal.id, currentUserId: user.id, body: messageBody });
      if (!result.ok) {
        setError(result.message);
      } else {
        setMessageBody('');
        if (!messageIdsRef.current.has(result.message.id)) {
          messageIdsRef.current.add(result.message.id);
          setDeal((prev: any) => prev ? { ...prev, messages: [...prev.messages, result.message] } : prev);
        }
        void markDealThreadReadFromMobile(deal.id);
      }
    } catch (err) {
      if (__DEV__) console.log('[deal-room] send message failed', { dealId: deal.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر إرسال الرسالة حالياً.');
    } finally {
      setSending(false);
    }
  }, [deal, messageBody, user?.id]);

  const confirmCompletion = useCallback(async () => {
    if (!deal || !user?.id) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmDealCompletedFromMobile({ dealId: deal.id, currentUserId: user.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } catch (err) {
      if (__DEV__) console.log('[deal-room] confirm completion failed', { dealId: deal.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تأكيد الإتمام حالياً.');
    } finally {
      setConfirming(false);
    }
  }, [deal, load, user?.id]);

  const realtimeLabel = useMemo(() => (realtimeStatus === 'live' ? 'الرسائل بتتحدث لحظيًا' : 'التحديث اللحظي غير متاح مؤقتًا'), [realtimeStatus]);

  if (!user?.id) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول لمتابعة الصفقة." /></AppScreen>;
  if (!id) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد الصفقة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحمّل بيانات الصفقة." /></AppScreen>;
  if (error && !deal) return <AppScreen><View style={styles.group}><EmptyState title="تعذر عرض الصفقة" description={error} /><AppButton label="إعادة المحاولة" onPress={load} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.group}>
    {!!error ? <AppCard><AppText muted>{error}</AppText></AppCard> : null}
    <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>غرفة الصفقة</AppText><AppText muted>{getDealStatusLabel(deal.status)}</AppText><AppText muted>{getDealStatusNextStep(deal.status)}</AppText></View></AppCard>

    <AppCard><View style={styles.group}><AppText weight="semibold">ملخص التبادل</AppText><AppText>المطلوب: {deal.requestedItem?.title ?? 'غير متاح'}</AppText><AppText>المعروض: {deal.offeredItem?.title ?? 'غير متاح'}</AppText></View></AppCard>

    <AppCard><View style={styles.group}><AppText weight="semibold">الأطراف</AppText><AppText>أنت: {(deal.viewerRole === 'requester' ? deal.requester : deal.offerer).displayName ?? 'مستخدم'}</AppText><AppText>الطرف التاني: {deal.otherParticipant.displayName ?? 'مستخدم'}</AppText></View></AppCard>

    <AppCard><View style={styles.group}><AppText weight="semibold">الرسائل</AppText><AppText muted>{realtimeLabel}</AppText>
      {deal.messages.length === 0 ? <EmptyState title="لسه مفيش رسائل" description="ابدأوا التنسيق من هنا." /> : deal.messages.map((msg: any) => {
        const mine = msg.senderId === user.id;
        return <View key={msg.id} style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}><AppText weight="semibold">{mine ? 'أنت' : deal.otherParticipant.displayName ?? 'الطرف التاني'}</AppText><AppText>{msg.body}</AppText><AppText muted>{new Date(msg.createdAt).toLocaleString('ar-EG')}</AppText></View>;
      })}
      {deal.canSendMessage ? <>
        <TextInput multiline value={messageBody} onChangeText={setMessageBody} maxLength={800} style={styles.input} placeholder="اكتب رسالة للتنسيق" textAlign="right" />
        <AppText muted>{messageBody.length}/800</AppText>
        <AppButton label={sending ? 'جاري الإرسال...' : 'إرسال'} onPress={sendMessage} disabled={sending} />
      </> : <AppText muted>المراسلة متوقفة لأن حالة الصفقة لا تسمح برسائل جديدة.</AppText>}
    </View></AppCard>

    {['coordinating', 'completed_pending_confirmation'].includes(deal.status) ? <AppCard><View style={styles.group}><AppText weight="semibold">تأكيد إتمام المقايضة</AppText><AppText>أنت: {deal.iConfirmed ? 'أكدت' : 'لسه'}</AppText><AppText>الطرف التاني: {deal.otherConfirmed ? 'أكد' : 'لسه'}</AppText><AppText muted>ما تضغطش تأكيد الإتمام غير بعد ما المقايضة تحصل فعلًا.</AppText>{deal.canConfirmCompletion ? <AppButton label={confirming ? 'جاري التأكيد...' : 'أكد إن المقايضة تمت'} onPress={confirmCompletion} disabled={confirming} /> : null}</View></AppCard> : null}

    {deal.status === 'completed' ? <AppCard><View style={styles.group}><AppText weight="semibold">المقايضة تمت بنجاح</AppText><AppText muted>تقدر تقيّم الطرف التاني بعد إتمام المقايضة.</AppText><AppButton label="قيّم التجربة" onPress={() => router.push(`/review/deal/${deal.id}`)} variant="neutral" /></View></AppCard> : null}

    <AppCard><View style={styles.group}><AppText weight="semibold">في مشكلة؟</AppText><AppText muted>لو حصل شيء غير مناسب أثناء التنسيق، ابعت بلاغًا من هنا.</AppText><AppButton label="الإبلاغ عن مشكلة" onPress={() => router.push(`/report/deal/${deal.id}`)} variant="neutral" /></View></AppCard>
  </View></AppScreen>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, title: { fontSize: 24 }, bubble: { padding: spacing.sm, borderRadius: 12, gap: 4 }, myBubble: { backgroundColor: '#e7f7ee' }, otherBubble: { backgroundColor: '#f2f2f2' }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, minHeight: 90, padding: 12, textAlignVertical: 'top' } });
