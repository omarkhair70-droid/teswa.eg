import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { MotionShareCard } from '@/components/motion/MotionShareCard';
import type { MotionShareMoment } from '@/lib/motion-share';
import { shareCapturedMotionMoment } from '@/lib/motion-share';

export type MotionShareSheetProps = {
  visible: boolean;
  moment: MotionShareMoment | null;
  onClose: () => void;
};

export function MotionShareSheet({ visible, moment, onClose }: MotionShareSheetProps) {
  const viewShotRef = useRef<ViewShotRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  if (!visible || !moment) {
    return null;
  }

  const handleShare = async () => {
    setBusy(true);
    setShareError(null);

    const result = await shareCapturedMotionMoment({
      capture: async () => {
        const uri = await viewShotRef.current?.capture?.();
        return uri ?? '';
      },
    });

    if (!result.ok) {
      setShareError(result.message);
    }

    setBusy(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>شارك نبض تِسوى</AppText>
            <AppText muted>حوّل هذه اللحظة إلى بطاقة جاهزة للمشاركة.</AppText>
          </View>

          <View style={styles.previewWrap}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
              <MotionShareCard moment={moment} />
            </ViewShot>
          </View>

          {shareError ? <AppText style={styles.errorText}>{shareError}</AppText> : null}

          <View style={styles.actions}>
            <AppButton label={busy ? 'جارٍ تجهيز البطاقة...' : 'مشاركة البطاقة'} onPress={handleShare} disabled={busy} />
            <AppButton label="إغلاق" variant="neutral" onPress={onClose} disabled={busy} />
          </View>

          <Pressable style={styles.closeHit} onPress={onClose} disabled={busy}>
            <AppText muted>إغلاق</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', padding: spacing.md },
  sheet: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md, gap: spacing.md, alignItems: 'center' },
  header: { width: '100%', gap: spacing.xs },
  title: { fontSize: 20 },
  previewWrap: { borderRadius: radii.lg, overflow: 'hidden' },
  actions: { width: '100%', gap: spacing.sm },
  errorText: { color: '#B42318', alignSelf: 'flex-start' },
  closeHit: { paddingTop: spacing.xs },
});
