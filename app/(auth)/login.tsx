import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AuthProviderButton } from '@/components/auth/AuthProviderButton';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { signInWithGoogle } from '@/lib/google-auth';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { loginFailureMessage } from '@/lib/backend/auth-feedback';

export default function LoginScreen() {
  const oracle = process.env.EXPO_PUBLIC_TESWA_BACKEND_PROVIDER === 'oracle';
  const nativeGoogleEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_ENABLED === 'true';
  const googleAvailable = !oracle || nativeGoogleEnabled;
  const nativeTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [enteringAccount, setEnteringAccount] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setDiagnosticsTapCount] = useState(0);
  const [showDiagnosticsEntry, setShowDiagnosticsEntry] = useState(false);

  const submit = async () => {
    if (loading || googleLoading || enteringAccount) return;
    if (!email.trim() || !password.trim()) return setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');
    setLoading(true);
    setError('');
    try {
      const signInResult = await teswaBackendRuntime.auth.signInWithPassword({ email: email.trim(), password });
      if (!signInResult.ok) {
        setEnteringAccount(false);
        return setError(loginFailureMessage(signInResult.reason, oracle));
      }
      setEnteringAccount(true);
    } catch {
      setEnteringAccount(false);
      setError('تعذر إكمال تسجيل الدخول. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading || enteringAccount) return;
    if (!googleAvailable) {
      setError('دخول جوجل غير مفعّل في النسخة دي. استخدم حسابًا له كلمة مرور على Oracle.');
      return;
    }
    setGoogleLoading(true);
    setError('');
    try {
      const { error: googleError } = await signInWithGoogle();
      if (googleError) setError(googleError);
    } catch {
      setError('تعذر إكمال تسجيل الدخول بجوجل. حاول مرة أخرى.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDiagnosticsUnlockTap = () => {
    if (!nativeTestModeEnabled || showDiagnosticsEntry) return;
    setDiagnosticsTapCount((prev) => {
      const next = prev + 1;
      if (next >= 7) setShowDiagnosticsEntry(true);
      return next;
    });
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell compact icon="log-in-outline" title="تسجيل الدخول" body="ارجع لعالم تِسوى، وكمّل من آخر حركة.">
        <View style={styles.form}>
          <AuthProviderButton
            label="المتابعة بجوجل"
            loadingLabel="جاري فتح جوجل..."
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={!googleAvailable || googleLoading || loading || enteringAccount}
          />
          <Pressable onPress={handleDiagnosticsUnlockTap}>
            <AppText style={styles.trust}>{googleAvailable ? 'دخول آمن وسريع عبر حساب Google.' : 'دخول جوجل غير مفعّل في النسخة دي. استخدم حسابًا له كلمة مرور على Oracle.'}</AppText>
          </Pressable>
          {nativeTestModeEnabled && showDiagnosticsEntry ? (
            <Link href="/(auth)/native-google-diagnostics" asChild>
              <Pressable style={styles.diagnosticsLinkWrap}>
                <AppText style={styles.diagnosticsLink}>اختبار Native Google</AppText>
              </Pressable>
            </Link>
          ) : null}
          <View style={styles.dividerWrap}><View style={styles.divider} /><AppText style={styles.dividerText}>أو سجل الدخول بالإيميل</AppText><View style={styles.divider} /></View>
          <View style={styles.formCard}>
            <AppInput style={styles.input} placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={(value) => { setEmail(value); setError(''); }} editable={!enteringAccount} />
            <AppInput style={styles.input} placeholder="كلمة المرور" secureTextEntry autoComplete="current-password" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} editable={!enteringAccount} />
            {enteringAccount ? <View style={styles.successCard}><AppText>ندخلك إلى تِسوى...</AppText></View> : null}
            {Boolean(error) && <View style={styles.errorCard}><AppText style={styles.error}>{error}</AppText></View>}
            <AppButton label={loading ? 'جاري الدخول...' : (enteringAccount ? 'نجهّز حسابك...' : 'دخول')} onPress={submit} disabled={loading || googleLoading || enteringAccount} />
          </View>
        </View>
      </AuthExperienceShell>
      <Link href="/(auth)/signup" asChild><Pressable><AppText style={styles.link}>ليس لديك حساب؟ أنشئ حساب</AppText></Pressable></Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  trust: { textAlign: 'center', opacity: 0.8, fontSize: 12 },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  divider: { height: 1, backgroundColor: '#D9D9D9', flex: 1 },
  dividerText: { opacity: 0.7, fontSize: 12 },
  formCard: { gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(221,208,197,0.9)', borderRadius: 18, padding: spacing.md, backgroundColor: 'rgba(255,253,248,0.92)' },
  input: { minHeight: 48, fontSize: 16, paddingVertical: spacing.sm },
  link: { textAlign: 'center', marginTop: spacing.sm },
  errorCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(179,38,30,0.25)', backgroundColor: 'rgba(255,240,239,0.9)', padding: spacing.sm },
  successCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(62,124,115,0.3)', backgroundColor: 'rgba(232,247,241,0.9)', padding: spacing.sm },
  error: { color: '#B3261E', textAlign: 'center' },
  diagnosticsLinkWrap: { alignSelf: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  diagnosticsLink: { fontSize: 12, opacity: 0.8, textDecorationLine: 'underline' },
});
