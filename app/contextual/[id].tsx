import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { useUnreadBadges } from '@/lib/unread-badges';
import {
  fetchContextualThreadById,
  markContextualThreadReadFromMobile,
  sendContextualMessageFromMobile,
} from '@/lib/contextual-conversations';

type RealtimeStatus = 'connecting' | 'live' | 'unavailable';

type UiMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export default function Screen() {
  const { user } = useAuth();
  const router = useRouter();
  const { refreshBadges } = useUnreadBadges();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const conversationId = id?.trim() ?? '';

  const messageIdsRef = useRef<Set<string>>(new Set());

  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>('connecting');

  const load = useCallback(async () => {
    if (!user?.id || !conversationId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchContextualThreadById({
        conversationId,
        currentUserId: user.id,
      });

      if (!result.ok) {
        setThread(null);
        setError(
          result.reason === 'unauthorized'
            ? 'غير مسموح لك بهذه المحادثة.'
            : 'المحادثة غير موجودة.',
        );
      } else {
        setThread(result.thread);
        messageIdsRef.current = new Set(result.thread.messages.map((m) => m.id));
        void markContextualThreadReadFromMobile(conversationId).finally(() => {
          void refreshBadges();
        });
      }
    } catch {
      setError('تعذر تحميل المحادثة حالياً.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, refreshBadges, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;

    const channel = supabase
      .channel(`contextual_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contextual_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (messageIdsRef.current.has(row.id)) return;

          messageIdsRef.current.add(row.id);
          const nextMessage: UiMessage = {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            body: row.body,
            createdAt: row.created_at,
          };

          setThread((prev: any) =>
            prev
              ? {
                  ...prev,
                  messages: [...prev.messages, nextMessage],
                }
              : prev,
          );

          if (row.sender_id !== user.id) {
            void markContextualThreadReadFromMobile(conversationId).finally(() => {
              void refreshBadges();
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setRealtimeStatus('unavailable');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, refreshBadges, user?.id]);

  const handleSend = useCallback(async () => {
    if (!thread || !user?.id) return;

    setSending(true);
    setError(null);

    const result = await sendContextualMessageFromMobile({
      conversationId: thread.id,
      currentUserId: user.id,
      body: messageBody,
    });

    if (!result.ok) {
      setError(result.message);
    } else {
      setMessageBody('');
      if (!messageIdsRef.current.has(result.message.id)) {
        messageIdsRef.current.add(result.message.id);
        setThread((prev: any) =>
          prev
            ? {
                ...prev,
                messages: [...prev.messages, result.message],
              }
            : prev,
        );
      }
      void markContextualThreadReadFromMobile(thread.id);
    }

    setSending(false);
  }, [messageBody, thread, user?.id]);

  if (!user?.id) {
    return (
      <AppScreen>
        <EmptyState
          title="تسجيل الدخول مطلوب"
          description="سجّل دخولك للوصول للمحادثات."
        />
      </AppScreen>
    );
  }

  if (!conversationId) {
    return (
      <AppScreen>
        <EmptyState
          title="معرّف غير صالح"
          description="تعذر تحديد المحادثة المطلوبة."
        />
      </AppScreen>
    );
  }

  if (loading) {
    return (
      <AppScreen>
        <EmptyState title="جاري التحميل" description="نحمّل المحادثة الآن." />
      </AppScreen>
    );
  }

  if (error && !thread) {
    return (
      <AppScreen>
        <View style={styles.group}>
          <EmptyState title="تعذر فتح المحادثة" description={error} />
          <AppButton label="إعادة المحاولة" onPress={() => void load()} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <KeyboardAwareScrollView contentContainerStyle={styles.group} bottomOffset={80}>
        <Pressable
          style={styles.header}
          onPress={() => router.push(`/profile/${thread.otherParticipant.id}`)}
        >
          <View style={styles.headerMain}>
            <AppText weight="semibold">
              {thread.otherParticipant.displayName ?? 'رد على قصة'}
            </AppText>
            <AppText muted>
              {realtimeStatus === 'unavailable'
                ? 'التحديث اللحظي غير متاح مؤقتًا'
                : 'الرسائل بتتحدث لحظيًا'}
            </AppText>
          </View>

          {thread.otherParticipant.avatarUrl ? (
            <Image source={{ uri: thread.otherParticipant.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <AppText>ر</AppText>
            </View>
          )}
        </Pressable>

        <View style={styles.card}>
          <AppText weight="semibold">رد على قصة</AppText>
          <AppText muted>
            هذه المحادثة بدأت من تفاعل داخل عالم تِسوى، وليست رسالة عامة.
          </AppText>
        </View>

        {thread.messages.length ? (
          thread.messages.map((message: any) => (
            <View
              key={message.id}
              style={[styles.row, message.senderId === user.id ? styles.mine : styles.other]}
            >
              <View style={styles.bubble}>
                <AppText>{message.body}</AppText>
                <AppText muted>
                  {new Date(message.createdAt).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </AppText>
              </View>
            </View>
          ))
        ) : (
          <EmptyState title="ابدأوا المحادثة" description="اكتبوا أول رسالة بعد الرد على القصة." />
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ opened: 0, closed: 0 }}>
        <View style={styles.composer}>
          <Pressable
            onPress={() => void handleSend()}
            disabled={!messageBody.trim() || sending}
            style={styles.send}
          >
            <AppText style={styles.sendText}>إرسال</AppText>
          </Pressable>

          <TextInput
            value={messageBody}
            onChangeText={setMessageBody}
            placeholder="اكتب رسالة..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            textAlign="right"
          />
        </View>
      </KeyboardStickyView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMain: {
    gap: 2,
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: 4,
  },
  row: {
    width: '100%',
  },
  mine: {
    alignItems: 'flex-start',
  },
  other: {
    alignItems: 'flex-end',
  },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  composer: {
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  send: {
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sendText: {
    color: colors.background,
  },
});
