import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase/client';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (loading) return;
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
      setMessage('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب ثم سجل دخولك.');
      router.replace('/(auth)/login');
      return;
    }
    router.replace('/(auth)/profile-setup');
  };

  return <AppScreen><View style={styles.header}><AppText weight="bold" style={styles.title}>إنشاء حساب</AppText></View><View style={styles.form}><AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} /><AppInput placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} /><AppInput placeholder="تأكيد كلمة المرور" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />{Boolean(error) && <AppText style={styles.error}>{error}</AppText>}{Boolean(message) && <AppText>{message}</AppText>}<AppButton label={loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'} onPress={submit} /></View><Link href="/(auth)/login" asChild><Pressable><AppText style={styles.link}>لديك حساب؟ تسجيل الدخول</AppText></Pressable></Link></AppScreen>;
}
const styles = StyleSheet.create({ header: { marginTop: spacing.xl }, title: { fontSize: 28 }, form: { gap: spacing.md, marginTop: spacing.xl }, link: { textAlign: 'center', marginTop: spacing.lg }, error: { color: '#B3261E' } });
