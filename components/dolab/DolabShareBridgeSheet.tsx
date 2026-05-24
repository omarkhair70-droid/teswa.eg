import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';
import type { DolabShareDraftTargetMode } from '@/lib/dolab/share-bridge-types';
import type { RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  selectedMessage: DolabSelfMessage | null;
  linkedDraft: DolabDraftItem | undefined;
  shareBody: string;
  targetMode: DolabShareDraftTargetMode;
  onChangeBody: (value: string) => void;
  onSelectTargetMode: (value: DolabShareDraftTargetMode) => void;
  onPrepareShare: () => void;
  onOpenMessages: () => void;
};

const messageTypeBadge: Record<DolabSelfMessage['messageType'], string> = {
  text: 'ملاحظة',
  idea: 'فكرة',
  checklist: 'قائمة',
  voice_placeholder: 'صوت لاحق',
};

export function DolabShareBridgeSheet(props: Props) {
  const { sheetRef, selectedMessage, linkedDraft, shareBody, targetMode, onChangeBody, onSelectTargetMode, onPrepareShare, onOpenMessages } = props;

  return (
    <AppBottomSheet
      ref={sheetRef}
      title="مشاركة من الدولاب"
      description="جهّز الرسالة دي عشان تبعتها في شات حقيقي لاحقًا."
      titleIconName="share-social-outline"
      snapPoints={['72%']}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {!selectedMessage ? (
          <AppText muted>اختار رسالة من شات نفسك الأول.</AppText>
        ) : (
          <>
            <View style={styles.previewCard}>
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{messageTypeBadge[selectedMessage.messageType]}</AppText>
              </View>
              <AppText>{selectedMessage.body}</AppText>
              {linkedDraft ? <AppText muted style={styles.meta}>مرتبطة بمسودة: {linkedDraft.title || 'بدون عنوان'}</AppText> : null}
              {selectedMessage.linkedPendingMediaIds.length > 0 ? (
                <AppText muted style={styles.meta}>ميديا مرتبطة: {selectedMessage.linkedPendingMediaIds.length}</AppText>
              ) : null}
            </View>

            <View style={styles.section}>
              <AppText weight="semibold">هتبعتها لمين؟</AppText>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="اختيار مشاركة الرسالة في شات لاحقًا"
                  onPress={() => onSelectTargetMode('choose_later')}
                  style={[styles.chip, targetMode === 'choose_later' && styles.chipSelected]}
                >
                  <AppText style={[styles.chipText, targetMode === 'choose_later' && styles.chipTextSelected]}>اختار شات لاحقًا</AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="فتح الرسائل لاختيار شات"
                  onPress={onOpenMessages}
                  style={[styles.chip, targetMode === 'direct_chat_placeholder' && styles.chipSelected]}
                >
                  <AppText style={[styles.chipText, targetMode === 'direct_chat_placeholder' && styles.chipTextSelected]}>افتح الرسائل</AppText>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <AppText weight="semibold">صيغة المشاركة</AppText>
              <AppInput
                value={shareBody}
                onChangeText={onChangeBody}
                placeholder="عدّل الصياغة قبل تجهيزها للمشاركة"
                multiline
              />
            </View>

            <AppButton label="جهّز للمشاركة" onPress={onPrepareShare} />
          </>
        )}
      </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  previewCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.round,
  },
  badgeText: { color: colors.primary, fontSize: 12 },
  meta: { fontSize: 12 },
  section: { gap: spacing.xs },
  row: { flexDirection: 'row-reverse', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: colors.white },
});
