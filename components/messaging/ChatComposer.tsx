import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

export type ComposerReply = { label: string; text: string; onClear: () => void };
export type ComposerRecording = { active: boolean; elapsedLabel: string; busy?: boolean; sending?: boolean; onCancel: () => void; onSend: () => void };

type ChatComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onPressAttachment?: () => void;
  onPressVoice?: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  attachmentDisabled?: boolean;
  voiceDisabled?: boolean;
  hasPendingPayload?: boolean;
  maxLength?: number;
  reply?: ComposerReply | null;
  recording?: ComposerRecording | null;
  topSlot?: React.ReactNode;
};

const WAVE = [7, 13, 9, 18, 11, 22, 14, 19, 8, 16, 12, 21, 10, 17, 7, 14, 9, 18];

const createStyles = (colors: TeswaThemeColors) => ({
  wrap: { gap: 8, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 3, backgroundColor: colors.background, borderTopWidth: 0.5, borderTopColor: colors.border },
  composerShell: { minHeight: 50, flexDirection: 'row-reverse' as const, alignItems: 'flex-end' as const, gap: 7 },
  leadingAction: { width: 42, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  inputShell: { flex: 1, minHeight: 48, maxHeight: 116, justifyContent: 'center' as const, borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 4 },
  input: { minHeight: 38, maxHeight: 104, paddingVertical: 8, color: colors.text, fontSize: 16, textAlign: 'right' as const },
  primaryAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primary, marginBottom: 2 },
  primaryActionDisabled: { opacity: 0.42 },
  primaryPressed: { transform: [{ scale: 0.94 }], opacity: 0.92 },
  voiceAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 2 },
  trailingSpacer: { width: 44, height: 44 },
  replyStrip: { minHeight: 52, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surface },
  replyAccent: { width: 3, alignSelf: 'stretch' as const, borderRadius: 2, backgroundColor: colors.primary },
  replyCopy: { flex: 1, gap: 1 },
  replyLabel: { fontSize: 12, color: colors.primary, textAlign: 'right' as const },
  replyText: { fontSize: 13, textAlign: 'right' as const },
  replyClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  recordingShell: { minHeight: 58, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 9, paddingHorizontal: 5 },
  recordingAction: { width: 42, height: 46, borderRadius: 23, alignItems: 'center' as const, justifyContent: 'center' as const },
  recordingBody: { flex: 1, minHeight: 50, justifyContent: 'center' as const, gap: 6, borderRadius: 25, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 7 },
  recordingMeta: { flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  recordingLabel: { fontSize: 12, color: colors.text },
  recordingTime: { marginLeft: 'auto' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[], fontSize: 12 },
  waveRow: { height: 23, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 2 },
  waveBar: { flex: 1, maxWidth: 4, minWidth: 2, borderRadius: 2, backgroundColor: colors.primary },
  pressed: { opacity: 0.55 },
});

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onPressAttachment,
  onPressVoice,
  placeholder = 'رسالة... ',
  disabled = false,
  sending = false,
  attachmentDisabled = false,
  voiceDisabled = false,
  hasPendingPayload = false,
  maxLength = 1200,
  reply,
  recording,
  topSlot,
}: ChatComposerProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const pulse = useRef(new Animated.Value(0.45)).current;
  const hasText = value.trim().length > 0;
  const hasSendablePayload = hasText || hasPendingPayload;
  const canSend = !disabled && !sending && hasSendablePayload;

  useEffect(() => {
    if (!recording?.active) {
      pulse.stopAnimation();
      pulse.setValue(0.45);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 520, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, recording?.active]);

  if (recording?.active) {
    return (
      <View style={styles.wrap}>
        {topSlot}
        <View style={styles.recordingShell}>
          <Pressable accessibilityRole="button" accessibilityLabel="إلغاء التسجيل" hitSlop={8} style={({ pressed }) => [styles.recordingAction, pressed && styles.pressed]} disabled={recording.busy || recording.sending} onPress={recording.onCancel}>
            <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
          </Pressable>
          <View style={styles.recordingBody}>
            <View style={styles.recordingMeta}>
              <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
              <AppText weight="semibold" style={styles.recordingLabel}>تسجيل صوتي</AppText>
              <AppText muted style={styles.recordingTime}>{recording.elapsedLabel}</AppText>
            </View>
            <View style={styles.waveRow} accessibilityElementsHidden>
              {WAVE.map((height, index) => <View key={`composer-wave-${index}`} style={[styles.waveBar, { height, opacity: index % 4 === 0 ? 0.55 : index % 3 === 0 ? 0.72 : 0.92 }]} />)}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="إرسال الرسالة الصوتية" style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryPressed]} disabled={recording.busy || recording.sending} onPress={recording.onSend}>
            {recording.busy || recording.sending ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="arrow-up" size={21} color={colors.white} />}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {reply ? (
        <View style={styles.replyStrip}>
          <View style={styles.replyAccent} />
          <View style={styles.replyCopy}>
            <AppText weight="semibold" style={styles.replyLabel}>{reply.label}</AppText>
            <AppText muted numberOfLines={1} style={styles.replyText}>{reply.text || 'رسالة'}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="إلغاء الرد" hitSlop={8} style={({ pressed }) => [styles.replyClose, pressed && styles.pressed]} onPress={reply.onClear}>
            <Ionicons name="close" size={17} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {topSlot}
      <View style={styles.composerShell}>
        {onPressAttachment ? (
          <Pressable accessibilityRole="button" accessibilityLabel="إضافة للمحادثة" hitSlop={6} disabled={disabled || attachmentDisabled} style={({ pressed }) => [styles.leadingAction, pressed && styles.pressed]} onPress={onPressAttachment}>
            <Ionicons name="add-circle" size={28} color={disabled || attachmentDisabled ? colors.border : colors.primary} />
          </Pressable>
        ) : null}
        <View style={styles.inputShell}>
          <TextInput value={value} onChangeText={onChangeText} editable={!disabled} placeholder={placeholder} placeholderTextColor={colors.textMuted} multiline maxLength={maxLength} style={styles.input} textAlignVertical="center" accessibilityLabel="اكتب رسالة" />
        </View>
        {hasSendablePayload ? (
          <Pressable accessibilityRole="button" accessibilityLabel="إرسال الرسالة" disabled={!canSend} onPress={onSend} style={({ pressed }) => [styles.primaryAction, !canSend && styles.primaryActionDisabled, pressed && canSend && styles.primaryPressed]}>
            {sending ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="arrow-up" size={21} color={colors.white} />}
          </Pressable>
        ) : onPressVoice ? (
          <Pressable accessibilityRole="button" accessibilityLabel="تسجيل رسالة صوتية" disabled={disabled || voiceDisabled} onPress={onPressVoice} style={({ pressed }) => [styles.voiceAction, pressed && styles.pressed]}>
            <Ionicons name="mic" size={21} color={disabled || voiceDisabled ? colors.border : colors.primary} />
          </Pressable>
        ) : <View style={styles.trailingSpacer} />}
      </View>
    </View>
  );
}
