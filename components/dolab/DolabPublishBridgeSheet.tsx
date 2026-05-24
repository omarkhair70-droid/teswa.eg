import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  selectedDraft: DolabDraftItem | null;
  linkedPendingMedia: DolabPendingMedia[];
  missingFields: string[];
  onPrepare: () => void;
};

export function DolabPublishBridgeSheet({ sheetRef, selectedDraft, linkedPendingMedia, missingFields, onPrepare }: Props) {
  const hasMissing = missingFields.length > 0;
  const checklist = [
    { key: 'title', label: 'اسم الحاجة', ready: !missingFields.includes('title') },
    { key: 'details_or_exchange_intent', label: 'تفاصيل أو نية تبادل', ready: !missingFields.includes('details_or_exchange_intent') },
    { key: 'linked_media', label: 'ميديا مرتبطة', ready: !missingFields.includes('linked_media') },
  ];

  return (
    <AppBottomSheet
      ref={sheetRef}
      title="تحويل المسودة لعرض"
      description="راجع بيانات الحاجة قبل ما تتحول لعنصر في سوق تِسوى."
      titleIconName="storefront-outline"
      snapPoints={['70%']}
    >
      <View style={styles.content}>
        <View style={styles.previewCard}>
          <AppText weight="semibold">{selectedDraft?.title || 'بدون اسم'}</AppText>
          <AppText muted style={styles.smallText}>{selectedDraft?.description || 'بدون وصف'}</AppText>
          <AppText muted style={styles.smallText}>التصنيف: {selectedDraft?.category || 'غير محدد'}</AppText>
          <AppText muted style={styles.smallText}>الحالة: {selectedDraft?.condition || 'غير محددة'}</AppText>
          <AppText muted style={styles.smallText}>نية التبادل: {selectedDraft?.exchangeIntent || 'غير مضافة'}</AppText>
          <AppText muted style={styles.smallText}>ميديا مرتبطة: {linkedPendingMedia.length}</AppText>
          {linkedPendingMedia.length === 0 ? <AppText style={styles.warningText}>أضف ميديا واحدة على الأقل قبل النشر الكامل.</AppText> : null}
        </View>

        <View style={styles.checklist}>
          <AppText weight="semibold">فحص الجاهزية</AppText>
          {checklist.map((item) => (
            <View key={item.key} style={styles.checkItem}>
              <Ionicons name={item.ready ? 'checkmark-circle' : 'alert-circle-outline'} size={18} color={item.ready ? colors.success : colors.danger} />
              <AppText>{item.label}</AppText>
            </View>
          ))}
        </View>

        <AppButton
          label={hasMissing ? 'احفظ كتحضير ناقص' : 'جهّز العرض'}
          onPress={onPrepare}
        />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  previewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#FFFEFB',
  },
  checklist: { gap: spacing.xs },
  checkItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  warningText: { color: colors.danger, fontSize: 12 },
  smallText: { fontSize: 12 },
});
