import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import {
  authenticateTeswaAppLock,
  type BiometricCapabilityState,
  getBiometricCapabilityState,
  readBiometricAppLockEnabled,
  writeBiometricAppLockEnabled,
} from '@/lib/biometric-app-lock';
import { requestMyAccountDeletion } from '@/lib/account-deletion';

export default function AccountSettingsScreen() {
  const { user, signOut } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapabilityState | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSecurity = useCallback(async () => {
    if (!user?.id) {
      setBiometricLoading(false);
      return;
    }
    setBiometricLoading(true);
    try {
      const [capability, enabled] = await Promise.all([
        getBiometricCapabilityState(),
        readBiometricAppLockEnabled(user.id),
      ]);
      setBiometricCapability(capability);
      setBiometricEnabled(enabled);
    } finally {
      setBiometricLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadSecurity(); }, [loadSecurity]);

  const capabilityCopy = useMemo(() => {
    if (biometricLoading) return 'بنتأكد من إمكانيات الجهاز...';
    if (!biometricCapability) return 'تعذر قراءة حالة الحماية على هذا الجهاز.';
    if (biometricCapability.status === 'available') {
      const labels = biometricCapability.supportedLabels.join('، ');
      return labels ? `متاح على جهازك: ${labels}` : 'التحقق البيومتري متاح على جهازك.';
    }
    if (biometricCapability.status === 'no_hardware') return 'الجهاز لا يدعم قفل التطبيق بالتحقق البيومتري.';
    if (biometricCapability.status === 'not_enrolled') return 'سجّل بصمة أو وجه من إعدادات الهاتف أولًا.';
    return 'الحماية البيومترية غير متاحة الآن.';
  }, [biometricCapability, biometricLoading]);

  const toggleBiometric = async () => {
    if (!user?.id || biometricBusy) return;
    setBiometricMessage(null);
    if (biometricEnabled) {
      setBiometricBusy(true);
      await writeBiometricAppLockEnabled(user.id, false);
      setBiometricEnabled(false);
      setBiometricMessage('تم إيقاف قفل التطبيق على هذا الجهاز.');
      setBiometricBusy(false);
      return;
    }
    if (biometricCapability?.status !== 'available') {
      setBiometricMessage('الحماية البيومترية غير جاهزة على هذا الجهاز.');
      return;
    }
    setBiometricBusy(true);
    const result = await authenticateTeswaAppLock('enable');
    if (result.success) {
      await writeBiometricAppLockEnabled(user.id, true);
      setBiometricEnabled(true);
      setBiometricMessage('تم تفعيل قفل تِسوى على هذا الجهاز.');
    } else {
      setBiometricMessage('لم يتم تفعيل القفل. تقدر تحاول مرة تانية.');
    }
    setBiometricBusy(false);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    if (!result.ok) setSignOutError(result.message);
    setSigningOut(false);
  };

  const handleDelete = () => {
    if (deleting) return;
    setDeleteError(null);
    Alert.alert(
      'حذف الحساب نهائيًا',
      'سيتم حذف حساب تِسوى والبيانات المرتبطة به، ولا يمكن التراجع بعد التأكيد.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف الحساب',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const result = await requestMyAccountDeletion();
            if (!result.ok) {
              setDeleteError(result.message);
              setDeleting(false);
              return;
            }
            await signOut();
            setDeleting(false);
          },
        },
      ],
    );
  };

  if (!user) {
    return <AppScreen backgroundVariant="soft"><View style={styles.centerState}><Ionicons name="log-in-outline" size={28} color={colors.primary} /><AppText weight="bold">سجّل الدخول لإدارة حسابك</AppText></View></AppScreen>;
  }

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للإعدادات" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>الحساب والأمان</AppText>
          <AppText weight="bold" style={styles.title}>تحكم في حسابك</AppText>
          <AppText muted style={styles.subtitle}>بيانات الدخول، حماية الجهاز، والجلسة في مكان واحد.</AppText>
        </View>
      </View>

      <AppCard style={styles.identityCard}>
        <View style={styles.rowIcon}><Ionicons name="person-circle-outline" size={22} color={colors.primary} /></View>
        <View style={styles.flexCopy}>
          <AppText muted style={styles.eyebrow}>الحساب الحالي</AppText>
          <AppText weight="bold">{user.email ?? 'حساب تِسوى'}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="تعديل الملف الشخصي" onPress={() => router.push('/profile/edit')} style={styles.smallAction}>
          <Ionicons name="create-outline" size={17} color={colors.primary} />
          <AppText weight="semibold" style={styles.smallActionText}>تعديل الملف</AppText>
        </Pressable>
      </AppCard>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText muted style={styles.eyebrow}>حماية هذا الجهاز</AppText>
          <AppText weight="bold" style={styles.sectionTitle}>قفل تِسوى</AppText>
          <AppText muted style={styles.sectionDescription}>استخدم البصمة أو التحقق المتاح على جهازك قبل فتح التطبيق.</AppText>
        </View>
        <AppCard style={styles.securityCard}>
          <View style={[styles.securityIcon, biometricEnabled && styles.securityIconActive]}>
            <Ionicons name="finger-print-outline" size={25} color={biometricEnabled ? colors.success : colors.primary} />
          </View>
          <View style={styles.securityCopy}>
            <View style={styles.statusRow}>
              <AppText weight="bold">قفل التطبيق</AppText>
              <View style={[styles.statusPill, biometricEnabled && styles.statusPillActive]}>
                <AppText style={[styles.statusText, biometricEnabled && styles.statusTextActive]}>{biometricEnabled ? 'مفعّل' : 'غير مفعّل'}</AppText>
              </View>
            </View>
            <AppText muted style={styles.securityDescription}>{capabilityCopy}</AppText>
            {biometricMessage ? <AppText style={styles.feedback}>{biometricMessage}</AppText> : null}
            <AppButton
              label={biometricBusy ? 'جاري التحديث...' : biometricEnabled ? 'إيقاف قفل التطبيق' : 'تفعيل قفل التطبيق'}
              onPress={() => void toggleBiometric()}
              loading={biometricBusy}
              disabled={biometricLoading}
              variant="neutral"
              fullWidth
            />
          </View>
        </AppCard>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText muted style={styles.eyebrow}>الجلسة</AppText>
          <AppText weight="bold" style={styles.sectionTitle}>الدخول والخروج</AppText>
        </View>
        <AppCard style={styles.sessionCard}>
          <View style={styles.sessionIntro}>
            <View style={styles.rowIcon}><Ionicons name="log-out-outline" size={21} color={colors.textMuted} /></View>
            <AppText muted style={styles.sessionText}>تسجيل الخروج لا يحذف أي بيانات أو عناصر من حسابك.</AppText>
          </View>
          {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}
          <AppButton label={signingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'} onPress={() => void handleSignOut()} loading={signingOut} variant="neutral" fullWidth />
        </AppCard>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText muted style={styles.eyebrow}>منطقة حساسة</AppText>
          <AppText weight="bold" style={styles.sectionTitle}>حذف الحساب</AppText>
          <AppText muted style={styles.sectionDescription}>راجع التفاصيل قبل أي قرار نهائي، أو نفّذ الحذف من هنا بعد التأكيد.</AppText>
        </View>
        <AppCard variant="outlined" style={styles.dangerCard}>
          <View style={styles.dangerIntro}>
            <View style={styles.dangerIcon}><Ionicons name="warning-outline" size={21} color={colors.danger} /></View>
            <View style={styles.flexCopy}>
              <AppText weight="bold" style={styles.dangerTitle}>الإجراء نهائي</AppText>
              <AppText muted style={styles.dangerDescription}>لو محتاج تعرف إيه اللي بيتحذف وإيه اللي قد يحتفظ به النظام لأسباب قانونية، افتح شرح حذف الحساب أولًا.</AppText>
            </View>
          </View>
          <AppButton label="شرح حذف الحساب" onPress={() => router.push('/account-deletion')} variant="neutral" fullWidth />
          {deleteError ? <AppText style={styles.errorText}>{deleteError}</AppText> : null}
          <AppButton label={deleting ? 'جارٍ حذف الحساب...' : 'حذف الحساب نهائيًا'} onPress={handleDelete} loading={deleting} variant="danger" fullWidth />
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  subtitle: { lineHeight: 21, textAlign: 'right' },
  identityCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  rowIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  flexCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  smallAction: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  smallActionText: { color: colors.primary, fontSize: 12 },
  section: { gap: spacing.sm },
  sectionHeading: { alignItems: 'flex-end', gap: 3, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 19, textAlign: 'right' },
  sectionDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  securityCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  securityIcon: { width: 52, height: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  securityIconActive: { backgroundColor: colors.successSoft },
  securityCopy: { flex: 1, alignItems: 'stretch', gap: spacing.sm },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.round, backgroundColor: colors.background },
  statusPillActive: { backgroundColor: colors.successSoft },
  statusText: { fontSize: 10, color: colors.textMuted },
  statusTextActive: { color: colors.success },
  securityDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  feedback: { fontSize: 12, color: colors.primary, textAlign: 'right' },
  sessionCard: { gap: spacing.md },
  sessionIntro: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sessionText: { flex: 1, lineHeight: 20, textAlign: 'right' },
  dangerCard: { gap: spacing.md, borderColor: 'rgba(185,56,56,0.24)' },
  dangerIntro: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  dangerIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  dangerTitle: { color: colors.danger },
  dangerDescription: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  errorText: { color: colors.danger, fontSize: 12, textAlign: 'right' },
});
