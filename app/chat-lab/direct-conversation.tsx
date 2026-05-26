import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DirectConversationSummary } from '@/lib/direct-messages';
import { fetchDirectConversation } from '@/lib/direct-messages';
import { getStreamDirectChannelConfig, getStreamDirectChannelId } from '@/lib/chat/stream-direct-mapping';
import { fetchStreamChatToken } from '@/lib/chat/stream-token';

type PilotMessage = {
  id: string;
  text: string;
  userId: string;
  createdAt?: string;
};

type StreamChannel = {
  watch: () => Promise<unknown>;
  sendMessage: (message: { text: string }) => Promise<unknown>;
  state?: {
    messages?: Array<{ id?: string; text?: string; user?: { id?: string }; created_at?: string | Date }>;
  };
};

type StreamChatClient = {
  connectUser: (user: { id: string }, token: string) => Promise<unknown>;
  channel: (type: string, id: string, extraData?: Record<string, unknown>) => StreamChannel;
  disconnectUser: () => Promise<unknown>;
};

export default function StreamDirectConversationLabScreen() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversation, setConversation] = useState<DirectConversationSummary | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [messages, setMessages] = useState<PilotMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const channelRef = useRef<StreamChannel | null>(null);

  const rawConversationId = useMemo(() => {
    if (Array.isArray(params.conversationId)) return params.conversationId[0] ?? '';
    return params.conversationId ?? '';
  }, [params.conversationId]);

  const conversationId = rawConversationId.trim();

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!conversationId) {
      setBusy(false);
      setErrorMessage(null);
      setConversation(null);
      setCurrentUserId(null);
      setChannelReady(false);
      setMessages([]);
      setDraft('');
      channelRef.current = null;
      return;
    }

    let mounted = true;
    let client: StreamChatClient | null = null;

    async function load() {
      setBusy(true);
      setErrorMessage(null);
      setConversation(null);
      setChannelReady(false);
      setMessages([]);
      channelRef.current = null;

      try {
        const auth = await fetchStreamChatToken();
        if (!auth.ok) throw new Error(auth.message);

        if (!mounted) return;
        setCurrentUserId(auth.userId);

        const convo = await fetchDirectConversation(conversationId);
        if (!mounted) return;

        if (!convo) {
          setConversation(null);
          setChannelReady(false);
          return;
        }

        setConversation(convo);

        if (convo.status !== 'accepted') {
          setChannelReady(false);
          return;
        }

        const streamModule = await import('stream-chat-expo');
        const StreamChat = (streamModule as { StreamChat?: { getInstance: (apiKey: string) => StreamChatClient } }).StreamChat;
        if (!StreamChat) throw new Error('StreamChat export is unavailable from stream-chat-expo');

        const channelConfig = getStreamDirectChannelConfig({
          conversationId,
          currentUserId: auth.userId,
          otherUserId: convo.otherUserId,
        });

        client = StreamChat.getInstance(auth.apiKey);
        await client.connectUser({ id: auth.userId }, auth.token);
        if (!mounted) return;

        const channel = client.channel(channelConfig.type, channelConfig.id, { members: channelConfig.members });
        await channel.watch();
        if (!mounted) return;

        channelRef.current = channel;
        setChannelReady(true);

        setMessages(
          (channel.state?.messages ?? []).map((message) => ({
            id: message.id ?? `${message.created_at ?? Date.now()}`,
            text: message.text ?? '',
            userId: message.user?.id ?? 'unknown',
            createdAt: message.created_at ? String(message.created_at) : undefined,
          })),
        );
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : 'تعذر تشغيل تجربة المحادثة حالياً.');
      } finally {
        if (mounted) setBusy(false);
      }
    }

    void load();

    return () => {
      mounted = false;
      channelRef.current = null;
      if (client) void client.disconnectUser().catch(() => undefined);
    };
  }, [conversationId, refreshToken]);

  const canSend = conversation?.status === 'accepted' && channelReady && !busy;

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    const channel = channelRef.current;
    if (!text || !channel || !canSend) return;

    await channel.sendMessage({ text });
    setMessages(
      (channel.state?.messages ?? []).map((message) => ({
        id: message.id ?? `${message.created_at ?? Date.now()}`,
        text: message.text ?? '',
        userId: message.user?.id ?? 'unknown',
        createdAt: message.created_at ? String(message.created_at) : undefined,
      })),
    );
    setDraft('');
  }, [canSend, draft]);

  if (!conversationId) {
    return (
      <AppScreen>
        <EmptyState title="مفيش conversationId" description="افتح المسار بالشكل: /chat-lab/direct-conversation?conversationId=..." iconName="chatbubble-ellipses-outline" />
      </AppScreen>
    );
  }

  const statusCopy =
    conversation?.status === 'requested'
      ? 'المحادثة لسه طلب مراسلة.'
      : conversation?.status === 'ignored'
        ? 'تم تجاهل طلب المراسلة.'
        : conversation?.status === 'blocked'
          ? 'المحادثة غير متاحة.'
          : null;

  return (
    <AppScreen scrollable>
      <AppText weight="bold" style={styles.title}>Teswa Direct — Stream Conversation Lab</AppText>

      {errorMessage ? <AppCard><AppText style={styles.errorText}>Error: {errorMessage}</AppText></AppCard> : null}

      <AppCard>
        <View style={styles.statusList}>
          <StatusRow label="Conversation loaded" value={!!conversation} />
          <StatusRow label="Stream channel watched" value={channelReady} />
          <StatusRow label="Composer enabled" value={canSend} />
          <StatusRow label="Status" valueText={conversation?.status ?? 'missing'} />
          {busy ? <ActivityIndicator /> : null}
        </View>
      </AppCard>

      {!conversation ? (
        <EmptyState title="المحادثة غير موجودة" description="تعذر تحميل بيانات المحادثة المطلوبة." iconName="alert-circle-outline" />
      ) : (
        <>
          <AppCard>
            <View style={styles.metaBlock}>
              <AppText muted>Conversation ID: {conversation.conversationId}</AppText>
              <AppText muted>Current User ID: {currentUserId ?? 'unknown'}</AppText>
              <AppText muted>Other User ID: {conversation.otherUserId}</AppText>
              <AppText muted>Channel ID: {getStreamDirectChannelId(conversation.conversationId)}</AppText>
              <AppText muted>Members: {currentUserId ?? 'unknown'}, {conversation.otherUserId}</AppText>
              {statusCopy ? <AppText style={styles.noticeText}>{statusCopy}</AppText> : null}
            </View>
          </AppCard>

          <AppCard>
            <AppText weight="semibold">Stream Messages</AppText>
            <View style={styles.messagesList}>
              {messages.length === 0 ? <AppText muted>لا توجد رسائل Stream بعد.</AppText> : messages.map((m) => (
                <AppCard key={m.id} padding="sm" variant="soft">
                  <AppText>{m.text || '(empty)'}</AppText>
                  <AppText muted>{m.userId}</AppText>
                </AppCard>
              ))}
            </View>
          </AppCard>

          <AppCard>
            <View style={styles.composerRow}>
              <TextInput value={draft} onChangeText={setDraft} placeholder="اكتب رسالة Stream للتجربة" style={styles.input} editable={canSend} />
              <AppButton label="Send" onPress={() => void sendMessage()} disabled={!canSend || !draft.trim()} size="sm" />
            </View>
          </AppCard>
        </>
      )}

      <AppButton label={busy ? 'Refreshing…' : 'Refresh'} onPress={refresh} disabled={busy} variant="neutral" />
    </AppScreen>
  );
}

function StatusRow({ label, value, valueText }: { label: string; value?: boolean; valueText?: string }) {
  return (
    <View style={styles.statusRow}>
      <AppText>{label}</AppText>
      <AppText muted>{valueText ?? (value ? 'Ready' : 'Pending')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22 },
  statusList: { gap: 10 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaBlock: { gap: 8 },
  errorText: { color: '#b91c1c' },
  noticeText: { color: '#92400e' },
  messagesList: { marginTop: 10, gap: 8 },
  composerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
});
