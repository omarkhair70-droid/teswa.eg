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

const messageTypeOptions: Array<{ type: DolabSelfMessageType; label: string }> = [
  { type: 'text', label: 'ملاحظة' },
  { type: 'idea', label: 'فكرة' },
  { type: 'checklist', label: 'قائمة' },
  { type: 'voice_placeholder', label: 'صوت لاحق' },
];

const badgeByType: Record<DolabSelfMessageType, string> = {
  text: 'ملاحظة',
  idea: 'فكرة',
  checklist: 'قائمة',
  voice_placeholder: 'صوت لاحق',
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
  shareFeedbackMessageId: string | null;
  onChangeBody: (value: string) => void;
  onSelectType: (value: DolabSelfMessageType) => void;
  onSelectDraft: (value: string | null) => void;
  onToggleMedia: (id: string) => void;
  onSave: () => void;
  onShareLater: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DolabSelfChatPanel(props: Props) {
  const {
    messages, localDrafts, pendingMedia, composerBody, selectedType, selectedDraftId,
    linkedMediaIds, composerError, shareFeedbackMessageId, onChangeBody, onSelectType,
    onSelectDraft, onToggleMedia, onSave, onShareLater, onDelete,
  } = props;

  return (
    <AppCard>
      <View style={styles.sectionHeader}>
        <AppText weight="bold">شات مع نفسك</AppText>
        <AppText muted>اكتب أفكار التبادل، ملاحظاتك، أو الكلام اللي ممكن تبعته لاحقًا.</AppText>
      </View>
      {messages.length === 0 ? <AppText muted style={styles.smallText}>ابدأ بأول فكرة في دولابك.</AppText> : null}
      {messages.map((message) => {
        const draftTitle = localDrafts.find((d) => d.id === message.linkedDraftId)?.title;
        return (
          <View key={message.id} style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <View style={styles.badge}><AppText style={styles.badgeText}>{badgeByType[message.messageType]}</AppText></View>
              <AppText muted style={styles.smallText}>الآن</AppText>
            </View>
            <AppText>{message.body}</AppText>
            {draftTitle ? <AppText muted style={styles.smallText}>مرتبطة بـ: {draftTitle}</AppText> : null}
            {message.linkedPendingMediaIds.length > 0 ? <AppText muted style={styles.smallText}>ميديا مرتبطة: {message.linkedPendingMediaIds.length}</AppText> : null}
            <View style={styles.actionsRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="شارك الرسالة لاحقًا في شات حقيقي" onPress={() => onShareLater(message.id)} style={styles.actionBtn}><AppText style={styles.actionText}>شارك لاحقًا</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="حذف الرسالة المحلية" onPress={() => onDelete(message.id)} style={styles.deleteBtn}><AppText style={styles.deleteText}>حذف</AppText></Pressable>
            </View>
            {shareFeedbackMessageId === message.id ? <AppText muted style={styles.smallText}>مشاركة الرسالة لشات حقيقي في PR لاحق.</AppText> : null}
          </View>
        );
      })}

      <AppInput value={composerBody} onChangeText={onChangeBody} placeholder="اكتب لنفسك فكرة أو ملاحظة..." multiline />
      {composerError ? <AppText style={styles.error}>{composerError}</AppText> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {messageTypeOptions.map((opt) => {
          const selected = selectedType === opt.type;
          return <Pressable key={opt.type} accessibilityRole="button" accessibilityLabel={`اختيار نوع الرسالة ${opt.label}`} onPress={() => onSelectType(opt.type)} style={[styles.chip, selected && styles.chipSel]}><AppText style={[styles.chipText, selected && styles.chipTextSel]}>{opt.label}</AppText></Pressable>;
        })}
      </ScrollView>
      {localDrafts.length === 0 ? <AppText muted style={styles.smallText}>اعمل مسودة عنصر الأول لو حابب تربط الملاحظة بحاجة.</AppText> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}><Pressable accessibilityRole="button" accessibilityLabel="بدون ربط مسودة" onPress={() => onSelectDraft(null)} style={[styles.chip, !selectedDraftId && styles.chipSel]}><AppText style={[styles.chipText, !selectedDraftId && styles.chipTextSel]}>بدون مسودة</AppText></Pressable>{localDrafts.map((d)=>{const sel=selectedDraftId===d.id; return <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`ربط الرسالة بمسودة ${d.title || 'بدون عنوان'}`} onPress={()=>onSelectDraft(d.id)} style={[styles.chip, sel&&styles.chipSel]}><AppText style={[styles.chipText, sel&&styles.chipTextSel]}>{d.title || 'مسودة بدون عنوان'}</AppText></Pressable>;})}</ScrollView>}
      {pendingMedia.length === 0 ? <AppText muted style={styles.smallText}>أضف ميديا في دولابك عشان تربطها بالملاحظة.</AppText> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>{pendingMedia.map((item,idx)=>{const sel=linkedMediaIds.includes(item.id); return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`تبديل ربط الميديا رقم ${idx+1}`} onPress={()=>onToggleMedia(item.id)} style={[styles.chip, sel&&styles.chipSel]}><Ionicons name={item.mediaType==='video'?'videocam-outline':'image-outline'} size={14} color={sel?colors.white:colors.primary} /><AppText style={[styles.chipText, sel&&styles.chipTextSel]}>ميديا {idx+1}</AppText></Pressable>;})}</ScrollView>}
      <AppButton label="حفظ" onPress={onSave} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { gap: 3, marginBottom: spacing.xs },
  messageCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#FFFEFC', gap: spacing.xs, marginBottom: spacing.xs },
  messageHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  badge: { backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: colors.primary },
  actionsRow: { flexDirection: 'row-reverse', gap: spacing.xs },
  actionBtn: { borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  deleteBtn: { borderWidth: 1, borderColor: '#F2B5B5', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  actionText: { fontSize: 12, color: colors.primary },
  deleteText: { fontSize: 12, color: colors.danger },
  chipsRow: { gap: spacing.xs, marginBottom: spacing.xs },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 7, backgroundColor: '#FFF9F1' },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.primary },
  chipTextSel: { color: colors.white },
  smallText: { fontSize: 12 },
  error: { color: colors.danger, fontSize: 12, marginBottom: spacing.xs },
});
