import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
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
    if (signInError) return setError('تعذر تسجيل الدخول. تأكد من البيانات وحاول مرة تانية.');
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading) return;
    setGoogleLoading(true);
    setError('');
    const { error: googleError } = await signInWithGoogle();
    setGoogleLoading(false);
    if (googleError) setError(googleError);
  };

  return <AppScreen><View style={styles.header}><AppText weight="bold" style={styles.title}>تسجيل الدخول</AppText><AppText style={styles.helper}>الدخول بجوجل هو الأسرع.</AppText></View><View style={styles.form}><AppButton label={googleLoading ? 'جاري فتح جوجل...' : 'المتابعة بجوجل'} onPress={handleGoogleSignIn} disabled={googleLoading || loading} /><View style={styles.dividerWrap}><View style={styles.divider} /><AppText style={styles.dividerText}>أو سجل الدخول بالإيميل</AppText><View style={styles.divider} /></View><AppInput placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} /><AppInput placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} />{Boolean(error) && <AppText style={styles.error}>{error}</AppText>}<AppButton label={loading ? 'جاري الدخول...' : 'دخول'} onPress={submit} disabled={loading || googleLoading} /></View><Link href="/(auth)/signup" asChild><Pressable><AppText style={styles.link}>ليس لديك حساب؟ أنشئ حساب</AppText></Pressable></Link></AppScreen>;
}
const styles = StyleSheet.create({ header: { marginTop: spacing.xl, gap: spacing.sm }, title: { fontSize: 28 }, helper: { opacity: 0.8 }, form: { gap: spacing.md, marginTop: spacing.xl }, dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }, divider: { height: 1, backgroundColor: '#D9D9D9', flex: 1 }, dividerText: { opacity: 0.7, fontSize: 12 }, link: { textAlign: 'center', marginTop: spacing.lg }, error: { color: '#B3261E' } });
