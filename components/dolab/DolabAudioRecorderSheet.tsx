import { useEffect, useMemo, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StyleSheet, View } from 'react-native';
import { RecordingPresets, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { buildDolabAudioRecordingResult, DOLAB_AUDIO_SAVE_ERROR, DOLAB_AUDIO_START_ERROR, prepareDolabAudioRecordingMode, requestDolabAudioPermission } from '@/lib/dolab/audio-recording';

const formatElapsed = (durationMs?: number) => `${Math.max(0, Math.floor((durationMs ?? 0) / 1000))}ث`;

type Props = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onSave: (payload: { uri: string; durationMs?: number; mimeType: string }) => void;
  onFeedback: (message: string) => void;
};

export function DolabAudioRecorderSheet({ sheetRef, onSave, onFeedback }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [busy, setBusy] = useState(false);

  const isRecording = !!recorderState.isRecording;
  const elapsedLabel = useMemo(() => formatElapsed(recorderState.durationMillis), [recorderState.durationMillis]);

  const startRecording = async () => {
    if (busy || isRecording) return;
    setBusy(true);
    const permission = await requestDolabAudioPermission();
    if (!permission.granted) {
      onFeedback(permission.errorMessage ?? DOLAB_AUDIO_START_ERROR);
      setBusy(false);
      return;
    }

    const mode = await prepareDolabAudioRecordingMode();
    if (!mode.ok) {
      onFeedback(mode.errorMessage ?? DOLAB_AUDIO_START_ERROR);
      setBusy(false);
      return;
    }

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      onFeedback(DOLAB_AUDIO_START_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const stopAndSave = async () => {
    if (busy || !isRecording) return;
    setBusy(true);
    try {
      const capturedDuration = recorderState.durationMillis;
      await recorder.stop();
      const built = buildDolabAudioRecordingResult(recorder.uri, capturedDuration, 'audio/m4a');
      if (!built.data) {
        onFeedback(built.errorMessage ?? DOLAB_AUDIO_SAVE_ERROR);
        return;
      }
      onSave(built.data);
      sheetRef.current?.dismiss();
    } catch {
      onFeedback(DOLAB_AUDIO_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (isRecording) {
      try { await recorder.stop(); } catch {}
    }
    sheetRef.current?.dismiss();
  };

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        void recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder, recorderState.isRecording]);

  return (
    <AppBottomSheet ref={sheetRef} title="تسجيل صوتي" description="سجّل فكرة سريعة أو ملاحظة عن الحاجة قبل ما تتحول لعرض." titleIconName="mic-outline" snapPoints={['48%']}>
      <View style={styles.body}>
        {isRecording ? (
          <View style={styles.recordingBadge}>
            <View style={styles.dot} />
            <AppText>جارٍ التسجيل • {elapsedLabel}</AppText>
          </View>
        ) : (
          <AppText muted>ابدأ التسجيل ثم احفظ الملاحظة الصوتية مباشرة في الدولاب.</AppText>
        )}
        <AppButton label="ابدأ التسجيل" variant="neutral" onPress={() => { void startRecording(); }} disabled={busy || isRecording} accessibilityRole="button" accessibilityLabel="ابدأ تسجيل ملاحظة صوتية" />
        <AppButton label="إيقاف وحفظ" onPress={() => { void stopAndSave(); }} disabled={busy || !isRecording} accessibilityRole="button" accessibilityLabel="إيقاف التسجيل وحفظ الملاحظة الصوتية" />
        <AppButton label="إلغاء" variant="ghost" onPress={() => { void cancel(); }} accessibilityRole="button" accessibilityLabel="إلغاء تسجيل الملاحظة الصوتية" />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingBottom: spacing.md },
  recordingBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, backgroundColor: '#FFF4F2', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 99, backgroundColor: colors.danger },
});
