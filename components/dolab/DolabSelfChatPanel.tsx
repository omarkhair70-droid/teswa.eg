import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage, DolabSelfMessageType } from '@/lib/dolab/self-chat-types';
import { DolabPendingMediaStrip } from '@/components/dolab/DolabPendingMediaStrip';
import { DolabVoiceNoteBubble } from '@/components/dolab/DolabVoiceNoteBubble';

const messageTypeOptions: Array<{ type: Exclude<DolabSelfMessageType, 'voice_placeholder'>; label: string }> = [
  { type: 'text', label: 'ملاحظة' },
  { type: 'idea', label: 'فكرة' },
  { type: 'checklist', label: 'قائمة' },
];

const badgeByType: Record<DolabSelfMessageType, string> = {
  text: 'ملاحظة',
  idea: 'فكرة',
  checklist: 'قائمة',
  voice_placeholder: 'تسجيل صوتي',
};

const formatCreatedAt = (createdAt: string) => {
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return '';
  const deltaMs = Date.now() - timestamp;
  if (deltaMs >= 0 && deltaMs < 60_000) return 'دلوقتي';
  if (deltaMs >= 0 && deltaMs < 60 * 60_000) return `من ${Math.max(1, Math.round(deltaMs / 60_000))} د`;
  const today = new Date();
  const created = new Date(timestamp);
  const sameDay = today.getFullYear() === created.getFullYear() && today.getMonth() === created.getMonth() && today.getDate() === created.getDate();
  if (sameDay) return created.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  return created.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

const syncCopy = (message: DolabSelfMessage) => {
  if (message.syncState === 'error') return { label: 'تعذر المزامنة', style: styles.syncError };
  if (message.syncState === 'pending') return { label: 'جاري المزامنة', style: styles.syncPending };
  if (message.syncState === 'synced' || message.remoteNoteId) return { label: 'في السحابة', style: styles.syncCloud };
  return { label: 'على الجهاز', style: styles.syncLocal };
};

type Props = {
  messages: DolabSelfMessage[];
  localDrafts: DolabDraftItem[];
  pendingMedia: DolabPendingMedia[];
  composerBody: string;
  selectedType: DolabSelfMessageType;
  selectedDraftId: string | null;
  linkedMediaIds: string[];
  composerError: string | null;
  shareStatusBySourceId: Record<string, 'prepared' | 'sent'>;
  onChangeBody: (value: string) => void;
  onSelectType: (value: DolabSelfMessageType) => void;
  onSelectDraft: (value: string | null) => void;
  onToggleMedia: (id: string) => void;
  onSave: () => void;
  onShareLater: (id: string) => void;
  onDelete: (id: string) => void;
  onStartFirstNote: () => void;
  onRecordVoice: () => void;
};

export function DolabSelfChatPanel(props: Props) {
  const {
    messages,
    localDrafts,
    pendingMedia,
    composerBody,
    selectedType,
    selectedDraftId,
    linkedMediaIds,
    composerError,
    shareStatusBySourceId,
    onChangeBody,
    onSelectType,
    onSelectDraft,
    onToggleMedia,
    onSave,
    onShareLater,
    onDelete,
    onStartFirstNote,
    onRecordVoice,
  } = props;

  return (
    <AppCard>
      <View style={styles.sectionHeader}>
        <AppText weight="bold">ملاحظاتي</AppText>
        <AppText muted>أفكار ونوتس وتسجيلات ترجع لها وقت ما تجهّز الحاجة للسوق.</AppText>
      </View>

      {messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <AppText weight="semibold">لسه مفيش ملاحظات.</AppText>
          <AppText muted style={styles.smallText}>اكتب نوت أو سجّل ريكورد لنفسك. كل حاجة بتتحفظ على الجهاز أولًا.</AppText>
          <View style={styles.emptyActions}>
            <AppButton label="اكتب أول نوت" onPress={onStartFirstNote} />
            <AppButton label="سجل ريكورد" variant="neutral" onPress={onRecordVoice} />
          </View>
        </View>
      ) : null}

      {messages.map((message) => {
        const draftTitle = localDrafts.find((draft) => draft.id === message.linkedDraftId)?.title;
        const isVoice = message.messageType === 'voice_placeholder';
        const sync = syncCopy(message);
        return (
          <View key={message.id} style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <View style={styles.headerBadges}>
                <View style={[styles.badge, isVoice && styles.voiceBadge]}>
                  {isVoice ? <Ionicons name="mic" size={12} color={colors.primary} /> : null}
                  <AppText style={styles.badgeText}>{badgeByType[message.messageType]}</AppText>
                </View>
                <View style={[styles.syncBadge, sync.style]}><AppText style={styles.syncText}>{sync.label}</AppText></View>
              </View>
              <AppText muted style={styles.smallText}>{formatCreatedAt(message.createdAt)}</AppText>
            </View>

            {isVoice ? <DolabVoiceNoteBubble message={message} pendingMedia={pendingMedia} /> : <AppText>{message.body}</AppText>}

            {draftTitle ? <AppText muted style={styles.smallText}>مرتبطة بـ: {draftTitle}</AppText> : null}
            {!isVoice && message.linkedPendingMediaIds.length > 0 ? <AppText muted style={styles.smallText}>ميديا مرتبطة: {message.linkedPendingMediaIds.length}</AppText> : null}
            {message.syncError ? <AppText style={styles.error}>{message.syncError}</AppText> : null}

            <View style={styles.actionsRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="شارك الملاحظة في شات" onPress={() => onShareLater(message.id)} style={styles.actionBtn}>
                <AppText style={styles.actionText}>مشاركة</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="حذف الملاحظة" onPress={() => onDelete(message.id)} style={styles.deleteBtn}>
                <AppText style={styles.deleteText}>حذف</AppText>
              </Pressable>
            </View>

            {shareStatusBySourceId[message.id] ? (
              <View style={styles.preparedBadge}>
                <AppText style={styles.preparedBadgeText}>{shareStatusBySourceId[message.id] === 'sent' ? 'اتشاركت' : 'مجهزة للمشاركة'}</AppText>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.composerWrap}>
        <View style={styles.composerHeader}>
          <AppText weight="semibold">سيب حاجة لنفسك</AppText>
          <AppText muted style={styles.smallText}>بتتحفظ على الجهاز أولًا، والمزامنة بتبان حالتها على كل ملاحظة.</AppText>
        </View>
        <AppInput value={composerBody} onChangeText={onChangeBody} placeholder="اكتب لنفسك..." multiline />
      </View>

      {composerError ? <AppText style={styles.error}>{composerError}</AppText> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {messageTypeOptions.map((option) => {
          const isSelected = selectedType === option.type;
          return (
            <Pressable key={option.type} accessibilityRole="button" accessibilityLabel={`اختيار نوع الرسالة ${option.label}`} onPress={() => onSelectType(option.type)} style={[styles.chip, isSelected && styles.chipSel]}>
              <AppText style={[styles.chipText, isSelected && styles.chipTextSel]}>{option.label}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {localDrafts.length === 0 ? (
        <AppText muted style={styles.smallText}>اعمل مسودة عنصر الأول لو حابب تربط الملاحظة بحاجة.</AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="بدون ربط مسودة" onPress={() => onSelectDraft(null)} style={[styles.chip, !selectedDraftId && styles.chipSel]}>
            <AppText style={[styles.chipText, !selectedDraftId && styles.chipTextSel]}>بدون مسودة</AppText>
          </Pressable>
          {localDrafts.map((draft) => {
            const isSelected = selectedDraftId === draft.id;
            return (
              <Pressable key={draft.id} accessibilityRole="button" accessibilityLabel={`ربط الرسالة بمسودة ${draft.title || 'بدون عنوان'}`} onPress={() => onSelectDraft(draft.id)} style={[styles.chip, isSelected && styles.chipSel]}>
                <AppText style={[styles.chipText, isSelected && styles.chipTextSel]}>{draft.title || 'مسودة بدون عنوان'}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <DolabPendingMediaStrip pendingMedia={pendingMedia} mode="selectable" selectedMediaIds={linkedMediaIds} onToggleSelect={onToggleMedia} emptyText="أضف ميديا في دولابك عشان تربطها بالملاحظة." />
      <AppButton label="حفظ على الجهاز" onPress={onSave} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { gap: 3, marginBottom: spacing.xs },
  composerWrap: { borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.lg, backgroundColor: '#FFF9F1', padding: spacing.sm, gap: spacing.xs, marginBottom: spacing.xs },
  composerHeader: { gap: 2 },
  emptyWrap: { borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.lg, backgroundColor: '#FFF9F1', padding: spacing.sm, gap: spacing.xs, marginBottom: spacing.xs },
  emptyActions: { gap: spacing.xs },
  messageCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#FFFEFC', gap: spacing.xs, marginBottom: spacing.xs },
  messageHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs },
  headerBadges: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 5, flex: 1 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: colors.primary },
  voiceBadge: { backgroundColor: '#FFECCF' },
  syncBadge: { borderRadius: radii.round, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  syncLocal: { backgroundColor: '#F4F1EC', borderColor: '#DDD4C8' },
  syncPending: { backgroundColor: '#FFF6E8', borderColor: '#E8C98F' },
  syncCloud: { backgroundColor: '#EFFAF1', borderColor: '#B9DCC5' },
  syncError: { backgroundColor: '#FFF0EF', borderColor: '#F1B8B4' },
  syncText: { fontSize: 10, color: colors.text },
  actionsRow: { flexDirection: 'row-reverse', gap: spacing.xs },
  actionBtn: { borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  deleteBtn: { borderWidth: 1, borderColor: '#F2B5B5', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  actionText: { fontSize: 12, color: colors.primary },
  deleteText: { fontSize: 12, color: colors.danger },
  preparedBadge: { alignSelf: 'flex-start', borderRadius: radii.round, backgroundColor: colors.accentSoft, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  preparedBadgeText: { color: colors.accent, fontSize: 11 },
  chipsRow: { gap: spacing.xs, marginBottom: spacing.xs },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 7, backgroundColor: '#FFF9F1' },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.primary },
  chipTextSel: { color: colors.white },
  smallText: { fontSize: 12 },
  error: { color: colors.danger, fontSize: 12, marginBottom: spacing.xs },
});
