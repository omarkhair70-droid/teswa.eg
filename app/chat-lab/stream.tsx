import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  hasStreamChatConfig,
  hasStreamChatLabConfig,
  STREAM_CHAT_API_KEY,
  STREAM_CHAT_ENABLED,
  STREAM_CHAT_TEST_CHANNEL_ID,
  STREAM_CHAT_TEST_USER_ID,
  STREAM_CHAT_TEST_USER_TOKEN,
} from '@/lib/chat/stream-chat-config';

type StreamChatClient = {
  connectUser: (user: { id: string }, token: string) => Promise<unknown>;
  channel: (type: string, id: string, extraData?: Record<string, unknown>) => {
    watch: () => Promise<unknown>;
  };
  disconnectUser: () => Promise<unknown>;
};

const FALLBACK_TEST_CHANNEL_ID = 'teswa-stream-runtime-lab';

export default function StreamChatLabScreen() {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const effectiveChannelId = useMemo(() => STREAM_CHAT_TEST_CHANNEL_ID.trim() || FALLBACK_TEST_CHANNEL_ID, []);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let client: StreamChatClient | null = null;

    async function runLab() {
      setSdkLoaded(false);
      setConnected(false);
      setChannelReady(false);

      if (!STREAM_CHAT_ENABLED || !hasStreamChatLabConfig) return;

      setRuntimeError(null);
      setConnecting(true);

      try {
        const streamModule = await import('stream-chat-expo');
        if (!mounted) return;

        setSdkLoaded(true);

        const StreamChat = (streamModule as { StreamChat?: { getInstance: (apiKey: string) => StreamChatClient } }).StreamChat;
        if (!StreamChat) {
          throw new Error('StreamChat export is unavailable from stream-chat-expo');
        }

        client = StreamChat.getInstance(STREAM_CHAT_API_KEY);
        await client.connectUser({ id: STREAM_CHAT_TEST_USER_ID }, STREAM_CHAT_TEST_USER_TOKEN);
        if (!mounted) return;

        setConnected(true);

        const channel = client.channel('messaging', effectiveChannelId, { members: [STREAM_CHAT_TEST_USER_ID] });
        await channel.watch();
        if (!mounted) return;

        setChannelReady(true);
      } catch (error) {
        if (!mounted) return;
        setRuntimeError(error instanceof Error ? error.message : 'Unknown Stream runtime error');
      } finally {
        if (mounted) setConnecting(false);
      }
    }

    void runLab();

    return () => {
      mounted = false;
      if (client) void client.disconnectUser().catch(() => undefined);
    };
  }, [effectiveChannelId, refreshToken]);

  return (
    <AppScreen>
      <View style={styles.container}>
        <AppText weight="bold" style={styles.title}>Stream Chat Lab</AppText>

        {!STREAM_CHAT_ENABLED ? (
          <EmptyState title="Stream is disabled" description="STREAM_CHAT_ENABLED is false. This internal lab will not run Stream until explicitly enabled in code." iconName="shield-checkmark-outline" />
        ) : null}

        {!hasStreamChatConfig ? (
          <EmptyState title="Missing API key" description="Set EXPO_PUBLIC_STREAM_CHAT_API_KEY to initialize the Stream Chat client." iconName="key-outline" compact />
        ) : null}

        {STREAM_CHAT_ENABLED && hasStreamChatConfig && !hasStreamChatLabConfig ? (
          <EmptyState title="Missing test user config" description="Set EXPO_PUBLIC_STREAM_CHAT_TEST_USER_ID and EXPO_PUBLIC_STREAM_CHAT_TEST_USER_TOKEN for this internal lab." iconName="alert-circle-outline" compact />
        ) : null}

        <AppCard>
          <View style={styles.statusList}>
            <StatusRow label="SDK loaded" value={sdkLoaded} />
            <StatusRow label="API key found" value={hasStreamChatConfig} />
            <StatusRow label="Test user connected" value={connected} />
            <StatusRow label="Channel ready" value={channelReady} />
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.infoBlock}>
            <AppText muted>Test user: {STREAM_CHAT_TEST_USER_ID || 'Not set'}</AppText>
            <AppText muted>Channel: {effectiveChannelId}</AppText>
            <AppText muted>Lab config complete: {hasStreamChatLabConfig ? 'Yes' : 'No'}</AppText>
            {runtimeError ? <AppText style={styles.errorText}>Runtime error: {runtimeError}</AppText> : null}
          </View>
        </AppCard>

        <AppButton label={connecting ? 'Connecting…' : 'Refresh Lab'} onPress={refresh} disabled={connecting} variant="neutral" />
      </View>
    </AppScreen>
  );
}

function StatusRow({ label, value }: { label: string; value: boolean }) {
  return (
    <View style={styles.row}>
      <AppText>{label}</AppText>
      <AppText muted>{value ? 'Ready' : 'Pending'}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 22 },
  statusList: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  infoBlock: { gap: 6 },
  errorText: { color: '#b91c1c' },
});
