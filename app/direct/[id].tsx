import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth';
import { acceptDirectMessageRequest, fetchDirectConversationMessages, fetchMyDirectConversations, ignoreDirectMessageRequest, sendDirectMessage } from '@/lib/direct-messages';

export default function DirectScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(id) ? id[0] ?? '' : id ?? '';
  const [convo, setConvo] = useState<any>(null); const [messages, setMessages] = useState<any[]>([]); const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { if (!conversationId) return; setLoading(true); setMessages(await fetchDirectConversationMessages(conversationId)); setConvo((await fetchMyDirectConversations()).find((c) => c.conversationId === conversationId) ?? null); setLoading(false); }, [conversationId]);
  useEffect(() => { void load(); }, [load]);
  const canManage = useMemo(() => convo?.status === 'requested' && convo?.requestedBy !== user?.id, [convo?.requestedBy, convo?.status, user?.id]);
  if (!conversationId) return <AppScreen><EmptyState title="محادثة غير صالحة" description="تعذر فتح المحادثة." /></AppScreen>;
  if (loading) return <AppScreen><EmptyState title="جاري التحميل" description="نحضر المحادثة الآن." /></AppScreen>;
  return <AppScreen scrollable><View style={styles.gap}><AppCard><View style={styles.row}><Image source={{ uri: convo?.otherAvatarUrl ?? undefined }} style={styles.avatar} /><View><AppText weight='semibold'>{convo?.otherDisplayName ?? 'محادثة مباشرة'}</AppText><AppText muted>@{convo?.otherUsername ?? 'teswa'}</AppText></View></View></AppCard>
    {canManage ? <View style={styles.row}><AppButton label='قبول' onPress={async()=>{await acceptDirectMessageRequest(conversationId); await load();}} /><AppButton label='تجاهل' variant='neutral' onPress={async()=>{await ignoreDirectMessageRequest(conversationId); await load();}} /></View> : null}
    {convo?.status === 'requested' && convo?.requestedBy === user?.id ? <AppText muted>تم إرسال طلب المراسلة.</AppText> : null}
    {messages.map((m) => <AppCard key={m.id}><AppText>{m.body}</AppText></AppCard>)}
    <View style={styles.row}><TextInput value={body} onChangeText={setBody} placeholder='اكتب رسالة...' style={styles.input} /><Pressable onPress={async()=>{await sendDirectMessage(conversationId, body); setBody(''); await load();}}><AppText>إرسال</AppText></Pressable></View>
  </View></AppScreen>;
}
const styles = StyleSheet.create({ gap: { gap: 8, padding: 12 }, row: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' }, input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 8, textAlign: 'right' } });
