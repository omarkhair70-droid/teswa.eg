import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export type StoryCameraStudioProps = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (asset: ImagePicker.ImagePickerAsset) => void;
};

const FLASH_CYCLE: Array<'off' | 'auto' | 'on'> = ['off', 'auto', 'on'];
const FLASH_LABEL: Record<'off' | 'auto' | 'on', string> = { off: 'فلاش مغلق', auto: 'فلاش تلقائي', on: 'فلاش يعمل' };

export function StoryCameraStudio({ visible, onClose, onCaptured }: StoryCameraStudioProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingCancelledRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'auto' | 'on'>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [studioError, setStudioError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!visible) {
      clearTimer();
      recordingCancelledRef.current = false;
      setRecording(false);
      setCaptureBusy(false);
      setCameraReady(false);
      setRecordingElapsedSeconds(0);
      setStudioError(null);
    }
  }, [clearTimer, visible]);

  const handleClose = async () => {
    if (recording && cameraRef.current) {
      recordingCancelledRef.current = true;
      try { cameraRef.current.stopRecording(); } catch {}
    }
    clearTimer();
    setRecording(false);
    setRecordingElapsedSeconds(0);
    onClose();
  };

  const handleCapturePhoto = async () => {
    if (!cameraReady || !cameraRef.current || captureBusy) return;
    setCaptureBusy(true);
    setStudioError(null);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (!result?.uri) {
        setStudioError('تعذر التقاط الصورة. حاول مرة أخرى.');
        return;
      }
      onCaptured({
        uri: result.uri,
        type: 'image',
        width: result.width ?? 0,
        height: result.height ?? 0,
        mimeType: 'image/jpeg',
        fileName: `story-camera-${Date.now()}.jpg`,
      });
      onClose();
    } catch {
      setStudioError('تعذر التقاط الصورة. حاول مرة أخرى.');
    } finally {
      setCaptureBusy(false);
    }
  };

  const handleVideoAction = async () => {
    if (!cameraReady || !cameraRef.current) return;
    if (recording) {
      try { cameraRef.current.stopRecording(); } catch {}
      return;
    }
    if (captureBusy) return;

    if (!microphonePermission?.granted) {
      const micResult = await requestMicrophonePermission();
      if (!micResult.granted) {
        setStudioError('نحتاج إذن الميكروفون لتسجيل الفيديو بالصوت.');
        return;
      }
    }

    recordingCancelledRef.current = false;
    setCaptureBusy(true);
    setRecording(true);
    setStudioError(null);
    setRecordingElapsedSeconds(0);
    timerRef.current = setInterval(() => setRecordingElapsedSeconds((value) => value + 1), 1000);

    try {
      const result = await cameraRef.current.recordAsync();
      if (recordingCancelledRef.current) return;
      if (!result?.uri) {
        setStudioError('تعذر حفظ الفيديو المسجل.');
        return;
      }
      onCaptured({ uri: result.uri, type: 'video', width: 0, height: 0, mimeType: 'video/mp4', fileName: `story-video-${Date.now()}.mp4` });
      onClose();
    } catch {
      if (!recordingCancelledRef.current) setStudioError('تعذر حفظ الفيديو المسجل.');
    } finally {
      clearTimer();
      recordingCancelledRef.current = false;
      setRecording(false);
      setCaptureBusy(false);
      setRecordingElapsedSeconds(0);
    }
  };

  if (!visible) return null;

  if (!cameraPermission) {
    return <Modal visible transparent animationType="fade"><View style={styles.loadingWrap}><AppText style={styles.lightText}>جارٍ تجهيز الكاميرا...</AppText></View></Modal>;
  }

  if (!cameraPermission.granted) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => void handleClose()}>
        <View style={styles.permissionWrap}>
          <View style={styles.permissionCard}>
            <AppText weight="bold">إذن الكاميرا مطلوب</AppText>
            <AppText muted>نحتاج الوصول للكاميرا حتى تلتقط قصتك من داخل تِسوى.</AppText>
            <Pressable style={styles.ctaButton} onPress={() => void requestCameraPermission()}><AppText style={styles.ctaText}>منح الإذن</AppText></Pressable>
            <Pressable style={styles.closeButton} onPress={() => void handleClose()}><AppText muted>إغلاق</AppText></Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  const elapsed = `${String(Math.floor(recordingElapsedSeconds / 60)).padStart(2, '0')}:${String(recordingElapsedSeconds % 60).padStart(2, '0')}`;

  return (
    <Modal visible animationType="slide" onRequestClose={() => void handleClose()}>
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} mode={mode} facing={facing} flash={flash} onCameraReady={() => setCameraReady(true)} />
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Pressable onPress={() => void handleClose()}><AppText style={styles.lightText}>إغلاق</AppText></Pressable>
            <AppText style={styles.lightText}>استوديو القصة</AppText>
            <View style={styles.spacer} />
          </View>

          <View style={[styles.modeRow, recording && styles.disabledControl]}>
            <Pressable style={[styles.modeChip, mode === 'picture' && styles.modeChipActive]} onPress={() => setMode('picture')} disabled={recording}><AppText style={styles.modeChipText}>صورة</AppText></Pressable>
            <Pressable style={[styles.modeChip, mode === 'video' && styles.modeChipActive]} onPress={() => setMode('video')} disabled={recording}><AppText style={styles.modeChipText}>فيديو</AppText></Pressable>
          </View>

          <View style={styles.bottomPanel}>
            {recording ? <View style={styles.recordBadge}><AppText style={styles.lightText}>{elapsed}</AppText></View> : null}
            {studioError ? <AppText style={styles.errorText}>{studioError}</AppText> : null}
            <View style={styles.controlsRow}>
              <Pressable style={[styles.secondaryControl, recording && styles.disabledControl]} onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))} disabled={recording}><AppText style={styles.lightText}>تبديل الكاميرا</AppText></Pressable>
              <Pressable style={[styles.captureButton, (!cameraReady || (captureBusy && !recording)) && styles.captureButtonDisabled]} onPress={() => void (mode === 'picture' ? handleCapturePhoto() : handleVideoAction())} disabled={!cameraReady || (captureBusy && !recording)}>
                <AppText weight="semibold">{mode === 'picture' ? 'التقاط' : recording ? 'إيقاف التسجيل' : 'بدء التسجيل'}</AppText>
              </Pressable>
              <Pressable style={[styles.secondaryControl, recording && styles.disabledControl]} onPress={() => setFlash((current) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(current) + 1) % FLASH_CYCLE.length])} disabled={recording}><AppText style={styles.lightText}>{FLASH_LABEL[flash]}</AppText></Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingTop: spacing.xl, paddingBottom: spacing.xl, paddingHorizontal: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 50 },
  lightText: { color: colors.white },
  modeRow: { flexDirection: 'row', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radii.round, padding: spacing.xs, gap: spacing.xs },
  modeChip: { borderRadius: radii.round, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  modeChipActive: { backgroundColor: colors.white },
  modeChipText: { color: colors.text },
  bottomPanel: { gap: spacing.sm },
  recordBadge: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radii.round, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  errorText: { color: '#B42318', textAlign: 'center' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  secondaryControl: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
  disabledControl: { opacity: 0.45 },
  captureButton: { minWidth: 120, borderRadius: radii.round, backgroundColor: colors.white, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: 'center' },
  captureButtonDisabled: { opacity: 0.5 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0E0E10' },
  permissionWrap: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.65)' },
  permissionCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  ctaButton: { backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', paddingVertical: spacing.sm },
  ctaText: { color: colors.white },
  closeButton: { alignItems: 'center', paddingVertical: spacing.xs },
});
