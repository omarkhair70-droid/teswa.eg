import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase/client';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) return setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) return setError('تعذر تسجيل الدخول. تأكد من البيانات وحاول مرة تانية.');
    router.replace('/(tabs)/home');
  };

  return <AppScreen><View style={styles.header}><AppText weight="bold" style={styles.title}>تسجيل الدخول</AppText></View><View style={styles.form}><AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} /><AppInput placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} />{Boolean(error) && <AppText style={styles.error}>{error}</AppText>}<AppButton label={loading ? 'جاري الدخول...' : 'دخول'} onPress={submit} /></View><Link href="/(auth)/signup" asChild><Pressable><AppText style={styles.link}>ليس لديك حساب؟ أنشئ حساب</AppText></Pressable></Link></AppScreen>;
}
const styles = StyleSheet.create({ header: { marginTop: spacing.xl }, title: { fontSize: 28 }, form: { gap: spacing.md, marginTop: spacing.xl }, link: { textAlign: 'center', marginTop: spacing.lg }, error: { color: '#B3261E' } });
