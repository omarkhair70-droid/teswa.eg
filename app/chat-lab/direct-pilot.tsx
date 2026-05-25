import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
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

export default function StreamDirectPilotScreen() {
  const [busy, setBusy] = useState(false);
  const [tokenState, setTokenState] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [connected, setConnected] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uiMode, setUiMode] = useState<'Stream UI' | 'Minimal fallback'>('Minimal fallback');
  const [messages, setMessages] = useState<PilotMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const channelId = useMemo(() => (activeUserId ? `teswa-direct-pilot-${activeUserId}` : null), [activeUserId]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let client: StreamChatClient | null = null;
    let channel: StreamChannel | null = null;

    async function connectPilot() {
      setBusy(true);
      setErrorMessage(null);
      setTokenState('pending');
      setConnected(false);
      setChannelReady(false);
      setMessages([]);

      try {
        const auth = await fetchStreamChatToken();
        if (!auth.ok) {
          setTokenState('failed');
          setErrorMessage(auth.message);
          return;
        }

        if (!mounted) return;
        setTokenState('ready');
        setActiveUserId(auth.userId);

        const streamModule = await import('stream-chat-expo');
        const StreamChat = (streamModule as { StreamChat?: { getInstance: (apiKey: string) => StreamChatClient } }).StreamChat;

        if (!StreamChat) {
          throw new Error('StreamChat export is unavailable from stream-chat-expo');
        }

        client = StreamChat.getInstance(auth.apiKey);
        await client.connectUser({ id: auth.userId }, auth.token);

        if (!mounted) return;
        setConnected(true);

        const internalChannelId = `teswa-direct-pilot-${auth.userId}`;
        channel = client.channel('messaging', internalChannelId, { members: [auth.userId] });
        await channel.watch();

        if (!mounted) return;
        setChannelReady(true);
        setUiMode('Minimal fallback');

        const initialMessages = (channel.state?.messages ?? []).map((message) => ({
          id: message.id ?? `${message.created_at ?? Date.now()}`,
          text: message.text ?? '',
          userId: message.user?.id ?? 'unknown',
          createdAt: message.created_at ? String(message.created_at) : undefined,
        }));

        setMessages(initialMessages);

        const send = async (text: string) => {
          if (!text.trim() || !channel) return;
          await channel.sendMessage({ text: text.trim() });
          const refreshedMessages = (channel.state?.messages ?? []).map((message) => ({
            id: message.id ?? `${message.created_at ?? Date.now()}`,
            text: message.text ?? '',
            userId: message.user?.id ?? 'unknown',
            createdAt: message.created_at ? String(message.created_at) : undefined,
          }));
          if (mounted) setMessages(refreshedMessages);
        };

        if (mounted) {
          setSendHandler(() => send);
        }
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize Stream direct pilot.');
      } finally {
        if (mounted) setBusy(false);
      }
    }

    void connectPilot();

    return () => {
      mounted = false;
      setSendHandler(() => async () => undefined);
      if (client) void client.disconnectUser().catch(() => undefined);
    };
  }, [refreshToken]);

  const [sendHandler, setSendHandler] = useState<(text: string) => Promise<void>>(() => async () => undefined);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    await sendHandler(text);
    setDraft('');
  }, [draft, sendHandler]);

  if (tokenState === 'failed') {
    return (
      <AppScreen>
        <EmptyState
          title="Stream token unavailable"
          description={errorMessage ?? 'Could not fetch backend Stream token for direct pilot.'}
          iconName="alert-circle-outline"
          actionLabel="Retry"
          onAction={refresh}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <AppText weight="bold" style={styles.title}>Direct Chat Pro — Stream Direct Pilot</AppText>

      <AppCard>
        <View style={styles.statusList}>
          <StatusRow label="Backend token fetched" value={tokenState === 'ready'} />
          <StatusRow label="User connected" value={connected} />
          <StatusRow label="Channel ready" value={channelReady} />
          <StatusRow label="UI mode" valueText={uiMode} />
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.metaBlock}>
          <AppText muted>User ID: {activeUserId ?? 'Not connected'}</AppText>
          <AppText muted>Channel ID: {channelId ?? 'Not ready'}</AppText>
          {busy ? <ActivityIndicator /> : null}
          {errorMessage ? <AppText style={styles.errorText}>Error: {errorMessage}</AppText> : null}
        </View>
      </AppCard>

      <AppCard>
        <AppText weight="semibold">Messages</AppText>
        <View style={styles.messagesList}>
          {messages.length === 0 ? (
            <AppText muted>No messages yet.</AppText>
          ) : (
            messages.map((message) => (
              <AppCard key={message.id} padding="sm" variant="soft">
                <AppText>{message.text || '(empty)'}</AppText>
                <AppText muted>{message.userId}</AppText>
              </AppCard>
            ))
          )}
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Send a pilot message"
            style={styles.input}
            editable={channelReady && !busy}
          />
          <AppButton label="Send" onPress={() => void sendMessage()} disabled={!channelReady || !draft.trim() || busy} size="sm" />
        </View>
      </AppCard>

      <AppButton label={busy ? 'Refreshing…' : 'Reconnect'} onPress={refresh} disabled={busy} variant="neutral" />
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
