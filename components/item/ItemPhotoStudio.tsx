import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export type ItemPhotoStudioProps = {
  visible: boolean;
  remainingSlots: number;
  onClose: () => void;
  onUseCapturedPhotos: (assets: ImagePicker.ImagePickerAsset[]) => void;
};

export function ItemPhotoStudio({ visible, remainingSlots, onClose, onUseCapturedPhotos }: ItemPhotoStudioProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [capturedAssets, setCapturedAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [studioError, setStudioError] = useState<string | null>(null);

  const maxSessionCaptures = useMemo(() => Math.max(0, remainingSlots), [remainingSlots]);
  const sessionFull = capturedAssets.length >= maxSessionCaptures;
  const captureDisabled = !cameraReady || captureBusy || sessionFull || remainingSlots <= 0;
  const flashLabel = flash === 'off' ? 'فلاش مغلق' : flash === 'auto' ? 'فلاش تلقائي' : 'فلاش يعمل';

  useEffect(() => {
    if (!visible) {
      setCapturedAssets([]);
      setStudioError(null);
      setCaptureBusy(false);
      setCameraReady(false);
      setFacing('back');
      setFlash('off');
    }
  }, [visible]);

  if (!visible) return null;

  const closeStudio = () => {
    setCapturedAssets([]);
    setStudioError(null);
    onClose();
  };

  const onCapture = async () => {
    if (captureDisabled || !cameraRef.current) return;

    setCaptureBusy(true);
    setStudioError(null);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (!shot?.uri) {
        setStudioError('تعذر التقاط الصورة. حاول مرة أخرى.');
        return;
      }
      const normalized: ImagePicker.ImagePickerAsset = {
        uri: shot.uri,
        type: 'image',
        width: shot.width ?? 0,
        height: shot.height ?? 0,
        mimeType: 'image/jpeg',
        fileName: `item-camera-${Date.now()}.jpg`,
      };
      setCapturedAssets((prev) => [...prev, normalized]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
      setStudioError('تعذر التقاط الصورة. حاول مرة أخرى.');
    } finally {
      setCaptureBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType='slide' onRequestClose={closeStudio}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Pressable onPress={closeStudio}><AppText style={styles.topAction}>إغلاق</AppText></Pressable>
          <AppText weight='bold'>استوديو تصوير العنصر</AppText>
          <AppText muted>{capturedAssets.length} / {maxSessionCaptures}</AppText>
        </View>

        {!permission ? (
          <View style={styles.centerPane}><AppText>جارٍ تجهيز الكاميرا...</AppText></View>
        ) : !permission.granted ? (
          <View style={styles.centerPane}>
            <View style={styles.permissionCard}>
              <AppText weight='bold'>إذن الكاميرا مطلوب</AppText>
              <AppText muted>نحتاج الوصول للكاميرا حتى تلتقط صور العنصر من داخل تِسوى.</AppText>
              <View style={styles.confirmRow}>
                <Pressable onPress={() => void requestPermission()} style={[styles.actionButton, styles.actionPrimary]}>
                  <AppText style={styles.actionPrimaryText}>منح الإذن</AppText>
                </Pressable>
                <Pressable onPress={closeStudio} style={[styles.actionButton, styles.actionSecondary]}>
                  <AppText>إغلاق</AppText>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flash} onCameraReady={() => setCameraReady(true)} />
          </View>
        )}

        <View style={styles.bottomSheet}>
          {remainingSlots <= 0 && <AppText muted>وصلت للحد الأقصى من الصور.</AppText>}
          {!!studioError && <AppText style={styles.errorText}>{studioError}</AppText>}

          {capturedAssets.length > 0 ? (
            <View style={styles.gap}>
              <AppText muted>راجع اللقطات قبل استخدامها.</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
                {capturedAssets.map((asset, index) => (
                  <View key={`${asset.uri}-${index}`} style={styles.thumbCard}>
                    <Image source={{ uri: asset.uri }} style={styles.thumb} />
                    <Pressable
                      onPress={() => setCapturedAssets((prev) => prev.filter((_, i) => i !== index))}
                      disabled={captureBusy}
                      style={[styles.deleteButton, captureBusy && styles.disabled]}
                    >
                      <AppText muted>حذف</AppText>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : <AppText muted>التقط أول صورة لعنصرك.</AppText>}

          <View style={styles.controlsRow}>
            <Pressable style={[styles.controlButton, captureBusy && styles.disabled]} disabled={captureBusy} onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}>
              <AppText>تبديل الكاميرا</AppText>
            </Pressable>
            <Pressable style={[styles.captureButton, captureDisabled && styles.disabled]} disabled={captureDisabled} onPress={() => { void onCapture(); }}>
              <AppText style={styles.captureText}>{sessionFull ? 'اكتملت الصور' : 'التقاط صورة'}</AppText>
            </Pressable>
            <Pressable style={[styles.controlButton, captureBusy && styles.disabled]} disabled={captureBusy} onPress={() => setFlash((prev) => (prev === 'off' ? 'auto' : prev === 'auto' ? 'on' : 'off'))}>
              <AppText>{flashLabel}</AppText>
            </Pressable>
          </View>

          {capturedAssets.length > 0 && (
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.actionButton, styles.actionPrimary]}
                onPress={() => {
                  onUseCapturedPhotos(capturedAssets);
                  closeStudio();
                }}
              >
                <AppText style={styles.actionPrimaryText}>استخدام الصور</AppText>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.actionSecondary]} onPress={closeStudio}>
                <AppText>إلغاء</AppText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingTop: spacing.xl, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface },
  topAction: { color: colors.primary },
  cameraWrap: { flex: 1, backgroundColor: colors.text },
  camera: { flex: 1 },
  centerPane: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  permissionCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  bottomSheet: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
  controlsRow: { flexDirection: 'row', gap: spacing.sm },
  controlButton: { flex: 1, alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radii.md, paddingVertical: spacing.sm },
  captureButton: { flex: 1, alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.round, paddingVertical: spacing.sm },
  captureText: { color: colors.white },
  disabled: { opacity: 0.5 },
  thumbStrip: { gap: spacing.sm },
  thumbCard: { width: 96, gap: spacing.xs },
  thumb: { width: 96, height: 96, borderRadius: radii.sm, backgroundColor: colors.border },
  deleteButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, alignItems: 'center', paddingVertical: 4, backgroundColor: colors.background },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, alignItems: 'center', borderRadius: radii.md, paddingVertical: spacing.sm },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: colors.white },
  actionSecondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  errorText: { color: '#B42318' },
  gap: { gap: spacing.xs },
});
