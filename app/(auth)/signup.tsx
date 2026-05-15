import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
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

  return <AppScreen><View style={styles.header}><AppText weight="bold" style={styles.title}>إنشاء حساب</AppText><AppText style={styles.helper}>أسرع طريقة تبدأ بها تِسوى.</AppText></View><View style={styles.form}><AppButton label={googleLoading ? 'جاري فتح جوجل...' : 'إنشاء الحساب بجوجل'} onPress={handleGoogleSignIn} disabled={googleLoading || loading || Boolean(message)} /><View style={styles.dividerWrap}><View style={styles.divider} /><AppText style={styles.dividerText}>أو أنشئ حسابك بالإيميل</AppText><View style={styles.divider} /></View><AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" editable={!message} value={email} onChangeText={setEmail} /><AppInput placeholder="كلمة المرور" secureTextEntry editable={!message} value={password} onChangeText={setPassword} /><AppInput placeholder="تأكيد كلمة المرور" secureTextEntry editable={!message} value={confirmPassword} onChangeText={setConfirmPassword} />{Boolean(error) && <AppText style={styles.error}>{error}</AppText>}{Boolean(message) && <AppText>{message}</AppText>}<AppButton label={loading ? 'جاري إنشاء الحساب...' : (message ? 'الانتقال لتسجيل الدخول' : 'إنشاء الحساب')} onPress={message ? (() => router.replace('/(auth)/login')) : submit} disabled={loading || googleLoading} /></View><Link href="/(auth)/login" asChild><Pressable><AppText style={styles.link}>لديك حساب؟ تسجيل الدخول</AppText></Pressable></Link></AppScreen>;
}
const styles = StyleSheet.create({ header: { marginTop: spacing.xl, gap: spacing.sm }, title: { fontSize: 28 }, helper: { opacity: 0.8 }, form: { gap: spacing.md, marginTop: spacing.xl }, dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }, divider: { height: 1, backgroundColor: '#D9D9D9', flex: 1 }, dividerText: { opacity: 0.7, fontSize: 12 }, link: { textAlign: 'center', marginTop: spacing.lg }, error: { color: '#B3261E' } });
