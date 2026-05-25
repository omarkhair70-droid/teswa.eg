import { Pressable, StyleSheet, View } from 'react-native';
import type { RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import type { DolabCollection } from '@/lib/dolab/collections';
import { spacing } from '@/constants/spacing';
import { colors } from '@/constants/colors';

type DolabCollectionPickerSheetProps = {
  sheetRef: RefObject<BottomSheetModal | null>;
  collections: DolabCollection[];
  onSelect: (id: string) => void;
};

export function DolabCollectionPickerSheet({
  sheetRef,
  collections,
  onSelect,
}: DolabCollectionPickerSheetProps) {
  return (
    <AppBottomSheet ref={sheetRef} title="أضف لمجموعة" description="اختار مجموعة للحفظ المحلي.">
      <View style={styles.wrap}>
        {collections.map((collection) => (
          <Pressable
            key={collection.id}
            style={styles.item}
            onPress={() => onSelect(collection.id)}
            accessibilityRole="button"
            accessibilityLabel={`اختيار مجموعة ${collection.name}`}
          >
            <AppText>{collection.name}</AppText>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.sm,
  },
});
