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
import { supabase } from '@/lib/supabase/client';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (loading || googleLoading) return;
    if (!email.trim() || !password.trim()) return setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      const rawMessage = (signInError.message || '').toLowerCase();
      if (rawMessage.includes('email not confirmed') || rawMessage.includes('confirm your email')) {
        return setError('لا يمكن تسجيل الدخول قبل تأكيد البريد الإلكتروني. راجع البريد الوارد وSpam/Junk ثم حاول مرة أخرى.');
      }
      return setError('تعذر تسجيل الدخول. تأكد من البيانات وحاول مرة تانية.');
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading) return;
    setGoogleLoading(true);
    setError('');
    const { error: googleError } = await signInWithGoogle();
    setGoogleLoading(false);
    if (googleError) setError(googleError);
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell icon="log-in-outline" title="تسجيل الدخول" body="ارجع لعالم تِسوى، وكمّل من آخر حركة.">
        <View style={styles.form}>
          <AuthProviderButton
            label="المتابعة بجوجل"
            loadingLabel="جاري فتح جوجل..."
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={googleLoading || loading}
          />
          <AppText style={styles.trust}>دخول آمن وسريع عبر حساب Google.</AppText>
          <View style={styles.dividerWrap}><View style={styles.divider} /><AppText style={styles.dividerText}>أو سجل الدخول بالإيميل</AppText><View style={styles.divider} /></View>
          <View style={styles.formCard}>
            <AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <AppInput placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} />
            {Boolean(error) && <View style={styles.errorCard}><AppText style={styles.error}>{error}</AppText></View>}
            <AppButton label={loading ? 'جاري الدخول...' : 'دخول'} onPress={submit} disabled={loading || googleLoading} />
          </View>
        </View>
      </AuthExperienceShell>
      <Link href="/(auth)/signup" asChild><Pressable><AppText style={styles.link}>ليس لديك حساب؟ أنشئ حساب</AppText></Pressable></Link>
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
  error: { color: '#B3261E', textAlign: 'center' },
});
