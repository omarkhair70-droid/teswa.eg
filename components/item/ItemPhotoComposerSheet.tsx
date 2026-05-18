import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { composeItemPhotoFromMobile, ItemPhotoComposerAction } from '@/lib/item-photo-composer';

export type ItemPhotoComposerSheetProps = {
  visible: boolean;
  originalAsset: ImagePicker.ImagePickerAsset | null;
  assetIndex: number | null;
  onClose: () => void;
  onUseComposedPhoto: (input: {
    asset: ImagePicker.ImagePickerAsset;
    assetIndex: number;
  }) => void;
};

export function ItemPhotoComposerSheet({ visible, originalAsset, assetIndex, onClose, onUseComposedPhoto }: ItemPhotoComposerSheetProps) {
  const [workingAsset, setWorkingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!visible || !originalAsset) return;
    setWorkingAsset(originalAsset);
    setBusy(false);
    setComposerError(null);
    setHasChanges(false);
  }, [visible, originalAsset?.uri]);

  if (!visible || !originalAsset || assetIndex === null || !workingAsset) return null;

  const runAction = async (action: ItemPhotoComposerAction) => {
    if (busy) return;
    setBusy(true);
    setComposerError(null);
    const result = await composeItemPhotoFromMobile({ asset: workingAsset, action });
    setBusy(false);

    if (!result.ok) {
      setComposerError(result.message);
      return;
    }

    setWorkingAsset(result.asset);
    setHasChanges(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>تهيئة صورة العنصر</AppText>
            <AppText muted>عدّل اتجاه الصورة أو قصّها بشكل متوازن قبل النشر.</AppText>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.previewFrame}>
              <ExpoImage
                source={{ uri: workingAsset.uri }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={150}
                style={styles.previewImage}
              />
            </View>

            <View style={styles.metaLine}>
              <AppText muted>الصورة رقم {assetIndex + 1}</AppText>
              {assetIndex === 0 ? <AppText muted>الغلاف الحالي</AppText> : null}
            </View>

            {busy ? <AppText muted style={styles.statusText}>جارٍ تجهيز الصورة...</AppText> : null}
            {composerError ? <AppText style={styles.errorText}>{composerError}</AppText> : null}

            <View style={styles.actionsWrap}>
              <Pressable style={[styles.chip, busy && styles.chipDisabled]} disabled={busy} onPress={() => void runAction('crop_item_square_1_1')}><AppText style={styles.chipText}>قص متوازن 1:1</AppText></Pressable>
              <Pressable style={[styles.chip, busy && styles.chipDisabled]} disabled={busy} onPress={() => void runAction('rotate_right')}><AppText style={styles.chipText}>تدوير يمين</AppText></Pressable>
              <Pressable style={[styles.chip, busy && styles.chipDisabled]} disabled={busy} onPress={() => void runAction('rotate_left')}><AppText style={styles.chipText}>تدوير شمال</AppText></Pressable>
              <Pressable style={[styles.chip, busy && styles.chipDisabled]} disabled={busy} onPress={() => void runAction('flip_horizontal')}><AppText style={styles.chipText}>عكس أفقي</AppText></Pressable>
              <Pressable
                style={[styles.chip, busy && styles.chipDisabled]}
                disabled={busy}
                onPress={() => {
                  setWorkingAsset(originalAsset);
                  setHasChanges(false);
                  setComposerError(null);
                }}
              >
                <AppText style={styles.chipText}>الرجوع للأصل</AppText>
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <AppButton
              label={hasChanges ? 'استخدام الصورة المعدلة' : 'استخدام الصورة كما هي'}
              disabled={busy}
              onPress={() => {
                onUseComposedPhoto({ asset: workingAsset, assetIndex });
                onClose();
              }}
            />
            <AppButton label="إلغاء" variant="neutral" disabled={busy} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 12, 9, 0.82)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    gap: spacing.xs,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, color: colors.text },
  scrollContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  previewFrame: {
    width: '100%',
    minHeight: 280,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  metaLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { textAlign: 'center', color: colors.textMuted },
  errorText: { textAlign: 'center', color: '#B42318' },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft },
  chipDisabled: { opacity: 0.6 },
  chipText: { color: colors.text },
  footer: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
