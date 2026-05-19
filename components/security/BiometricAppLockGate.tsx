import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';

type BiometricAppLockGateProps = {
  mode: 'unlock' | 'recovery';
  busy?: boolean;
  message?: string | null;
  onUnlock: () => void;
  onContinueWithoutBiometric?: () => void;
};

export function BiometricAppLockGate({ mode, busy = false, message, onUnlock, onContinueWithoutBiometric }: BiometricAppLockGateProps) {
  const isRecovery = mode === 'recovery';

  return (
    <View style={styles.overlay}>
      <LinearGradient colors={['#FFF4E6', '#F8E6D8', '#F1D6C4']} style={styles.surface}>
        <View style={styles.iconWrap}><Ionicons name={isRecovery ? 'shield-checkmark-outline' : 'lock-closed-outline'} size={34} color="#7C2D12" /></View>
        <AppText style={styles.eyebrow} weight="semibold">{isRecovery ? 'الحماية غير متاحة' : 'حماية محلية'}</AppText>
        <AppText style={styles.title} weight="bold">{isRecovery ? 'تعذر استخدام القفل البيومتري الآن' : 'تِسوى مقفول الآن'}</AppText>
        <AppText style={styles.body}>{isRecovery ? 'تقدر تتابع إلى التطبيق، وبعدها راجع إعدادات الحماية من حسابك.' : 'افتح التطبيق بالبصمة أو التحقق المتاح على جهازك.'}</AppText>

        {message ? <View style={styles.note}><AppText style={styles.noteText}>{message}</AppText></View> : null}

        {isRecovery ? (
          <>
            <Pressable style={styles.primaryButton} onPress={onContinueWithoutBiometric}>
              <AppText style={styles.primaryButtonText} weight="semibold">المتابعة إلى التطبيق</AppText>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onUnlock}>
              <AppText style={styles.secondaryButtonText} weight="semibold">حاول التحقق مرة أخرى</AppText>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} onPress={onUnlock} disabled={busy}>
            <AppText style={styles.primaryButtonText} weight="semibold">{busy ? 'جاري التحقق...' : 'افتح بالبصمة'}</AppText>
          </Pressable>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999, padding: spacing.lg, justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  surface: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(124, 45, 18, 0.2)', padding: spacing.xl, gap: spacing.md },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  eyebrow: { textAlign: 'center', color: '#9A3412' },
  title: { textAlign: 'center', fontSize: 24, color: '#7C2D12' },
  body: { textAlign: 'center', lineHeight: 24, color: '#7C2D12' },
  note: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(124, 45, 18, 0.2)', padding: spacing.sm },
  noteText: { color: '#7C2D12', textAlign: 'center' },
  primaryButton: { backgroundColor: '#7C2D12', borderRadius: 14, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { color: '#fff' },
  secondaryButton: { borderRadius: 14, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(124,45,18,0.35)', backgroundColor: 'rgba(255,255,255,0.8)' },
  secondaryButtonText: { color: '#7C2D12' },
  disabledButton: { opacity: 0.65 },
});
