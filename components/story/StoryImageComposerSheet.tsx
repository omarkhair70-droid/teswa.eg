import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { composeStoryImageFromMobile, StoryImageComposerAction } from '@/lib/story-image-composer';

export type StoryImageComposerSheetProps = {
  visible: boolean;
  originalAsset: ImagePicker.ImagePickerAsset | null;
  onClose: () => void;
  onUseComposedImage: (asset: ImagePicker.ImagePickerAsset) => void;
};

export function StoryImageComposerSheet({ visible, originalAsset, onClose, onUseComposedImage }: StoryImageComposerSheetProps) {
  const [workingAsset, setWorkingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!visible || !originalAsset) return;
    setWorkingAsset(originalAsset);
    setComposerError(null);
    setHasChanges(false);
    setBusy(false);
  }, [visible, originalAsset?.uri]);

  if (!visible || !originalAsset || !workingAsset) return null;

  const runAction = async (action: StoryImageComposerAction) => {
    if (busy) return;
    setBusy(true);
    setComposerError(null);
    const result = await composeStoryImageFromMobile({ asset: workingAsset, action });
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
            <AppText weight="bold" style={styles.title}>تهيئة صورة القصة</AppText>
            <AppText muted>اضبط الإطار قبل النشر، من غير ما تعقّد اللحظة.</AppText>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.previewFrame}>
              <ExpoImage
                source={{ uri: workingAsset.uri }}
                contentFit="contain"
                transition={150}
                cachePolicy="memory-disk"
                style={styles.previewImage}
              />
            </View>

            {busy ? <AppText muted style={styles.statusText}>جارٍ تجهيز الصورة...</AppText> : null}
            {composerError ? <AppText style={styles.errorText}>{composerError}</AppText> : null}

            <View style={styles.actionsWrap}>
              <Pressable style={[styles.chip, busy && styles.chipDisabled]} disabled={busy} onPress={() => void runAction('crop_story_9_16')}><AppText style={styles.chipText}>إطار قصة 9:16</AppText></Pressable>
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
                onUseComposedImage(workingAsset);
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
    maxHeight: '96%',
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
  scrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  previewFrame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    aspectRatio: 9 / 16,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  statusText: { textAlign: 'center', color: colors.textMuted },
  errorText: { textAlign: 'center', color: '#B42318' },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
