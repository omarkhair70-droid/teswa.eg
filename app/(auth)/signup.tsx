import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AuthProviderButton } from '@/components/auth/AuthProviderButton';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase/client';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (loading || message || googleLoading) return;
    if (!email.trim() || !password.trim()) return setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');
    if (password.length < 6) return setError('كلمة المرور لازم تكون 6 أحرف أو أكتر.');
    if (password !== confirmPassword) return setError('تأكيد كلمة المرور غير مطابق.');

    setLoading(true);
    setError('');
    setMessage('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (signUpError) return setError('تعذر إنشاء الحساب. حاول مرة تانية.');
    if (!data.session) {
      setMessage('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب، وبعدها ادخل من شاشة تسجيل الدخول.');
      return;
    }
    router.replace('/(auth)/profile-setup');
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading || message) return;
    setGoogleLoading(true);
    setError('');
    const { error: googleError } = await signInWithGoogle();
    setGoogleLoading(false);
    if (googleError) setError(googleError);
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell icon="person-add-outline" title="إنشاء حساب" body="ابدأ بطريقتك الأسرع، وخلّي تِسوى يجهز لك أول باب.">
        <View style={styles.form}>
          <AuthProviderButton label="إنشاء الحساب بجوجل" loadingLabel="جاري فتح جوجل..." onPress={handleGoogleSignIn} loading={googleLoading} disabled={googleLoading || loading || Boolean(message)} />
          <AppText style={styles.trust}>بجوجل تبدأ أسرع، وبالإيميل تقدر تكمل بطريقتك.</AppText>
          <View style={styles.dividerWrap}><View style={styles.divider} /><AppText style={styles.dividerText}>أو أنشئ حسابك بالإيميل</AppText><View style={styles.divider} /></View>
          <View style={styles.formCard}>
            <AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" editable={!message} value={email} onChangeText={setEmail} />
            <AppInput placeholder="كلمة المرور" secureTextEntry editable={!message} value={password} onChangeText={setPassword} />
            <AppInput placeholder="تأكيد كلمة المرور" secureTextEntry editable={!message} value={confirmPassword} onChangeText={setConfirmPassword} />
            {Boolean(error) && <View style={styles.errorCard}><AppText style={styles.error}>{error}</AppText></View>}
            {Boolean(message) && <View style={styles.successCard}><AppText>{message}</AppText></View>}
            <AppButton label={loading ? 'جاري إنشاء الحساب...' : (message ? 'الانتقال لتسجيل الدخول' : 'إنشاء الحساب')} onPress={message ? (() => router.replace('/(auth)/login')) : submit} disabled={loading || googleLoading} />
          </View>
        </View>
      </AuthExperienceShell>
      <Link href="/(auth)/login" asChild><Pressable><AppText style={styles.link}>لديك حساب؟ تسجيل الدخول</AppText></Pressable></Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  trust: { textAlign: 'center', opacity: 0.8, fontSize: 12 },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  divider: { height: 1, backgroundColor: '#D9D9D9', flex: 1 },
  dividerText: { opacity: 0.7, fontSize: 12 },
  formCard: { gap: spacing.md, borderWidth: 1, borderColor: 'rgba(221,208,197,0.9)', borderRadius: 18, padding: spacing.md, backgroundColor: 'rgba(255,253,248,0.92)' },
  link: { textAlign: 'center', marginTop: spacing.sm },
  errorCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(179,38,30,0.25)', backgroundColor: 'rgba(255,240,239,0.9)', padding: spacing.sm },
  successCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(62,124,115,0.3)', backgroundColor: 'rgba(232,247,241,0.9)', padding: spacing.sm },
  error: { color: '#B3261E', textAlign: 'center' },
});
