import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function ProfileSetupScreen() {
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!user || loading) return;
    if (!displayName.trim() || !username.trim()) return setError('من فضلك اكتب الاسم واسم المستخدم.');
    if (!USERNAME_REGEX.test(username)) return setError('اسم المستخدم لازم يكون من 3 إلى 20 حرف أو رقم أو _.');
    setLoading(true);
    setError('');
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName.trim(), username: username.trim().toLowerCase() }, { onConflict: 'id' });
    setLoading(false);
    if (upsertError) {
      if (upsertError.code === '23505') return setError('اسم المستخدم ده مستخدم قبل كده.');
      return setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
    }
    await refreshProfile();
    router.replace('/(tabs)/home');
  };

  return <AppScreen><View style={styles.header}><AppText weight="bold" style={styles.title}>إكمال بيانات الحساب</AppText><AppText muted>قبل البدء، أضف البيانات الأساسية.</AppText></View><View style={styles.form}><AppInput placeholder="الاسم الظاهر" value={displayName} onChangeText={setDisplayName} /><AppInput placeholder="اسم المستخدم" autoCapitalize="none" value={username} onChangeText={setUsername} />{Boolean(error) && <AppText style={styles.error}>{error}</AppText>}<AppButton label={loading ? 'جارِ الحفظ...' : 'حفظ والمتابعة'} onPress={submit} /></View></AppScreen>;
}
const styles = StyleSheet.create({ header: { marginTop: spacing.xl, gap: spacing.sm }, title: { fontSize: 28 }, form: { gap: spacing.md, marginTop: spacing.xl }, error: { color: '#B3261E' } });
