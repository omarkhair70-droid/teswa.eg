import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const UPSERT_TIMEOUT_MS = 12_000;
const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try { return await Promise.race([promise, timeoutPromise]); } finally { if (timeoutId) clearTimeout(timeoutId); }
};

export default function ProfileSetupScreen() {
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const saveProfileOnce = (userId: string) => withTimeout(supabase.from('profiles').upsert({ id: userId, display_name: displayName.trim(), username: username.trim().toLowerCase() }, { onConflict: 'id' }), UPSERT_TIMEOUT_MS, 'PROFILE_UPSERT_TIMEOUT');

  const submit = async () => {
    if (!user || loading) return;
    const currentUserId = user.id;
    if (!displayName.trim() || !username.trim()) return setError('من فضلك اكتب الاسم واسم المستخدم.');
    if (!USERNAME_REGEX.test(username)) return setError('اسم المستخدم لازم يكون من 3 إلى 20 حرف أو رقم أو _.');
    const handleUpsertError = (upsertError: { code?: string }) => {
      if (__DEV__) console.log('[ProfileSetup] upsert error', upsertError);
      if (upsertError.code === '23505') return setError('اسم المستخدم ده مستخدم قبل كده.');
      return setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
    };
    try {
      setLoading(true); setError('');
      const attemptOneResult = await saveProfileOnce(currentUserId);
      if (attemptOneResult.error) { handleUpsertError(attemptOneResult.error); return; }
      await refreshProfile(); router.replace('/(auth)/policy-acceptance');
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message === 'PROFILE_UPSERT_TIMEOUT') {
        if (__DEV__) console.log('[ProfileSetup] upsert timeout, retrying once');
        try {
          if (__DEV__) console.log('[ProfileSetup] upsert attempt 2 started');
          const attemptTwoResult = await saveProfileOnce(currentUserId);
          if (attemptTwoResult.error) { handleUpsertError(attemptTwoResult.error); return; }
          await refreshProfile(); router.replace('/(auth)/policy-acceptance'); return;
        } catch (retryError) {
          if (__DEV__) console.log('[ProfileSetup] retry failed', retryError);
          if (retryError instanceof Error && retryError.message === 'PROFILE_UPSERT_TIMEOUT') { setError('استغرق حفظ البيانات وقتًا أطول من المتوقع. حاول مرة تانية.'); return; }
          setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.'); return;
        }
      }
      if (__DEV__) console.log('[ProfileSetup] save failed', submitError);
      setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
    } finally { setLoading(false); }
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell eyebrow="آخر خطوة" icon="person-circle-outline" title="كمّل حضورك في تِسوى" body="اسمك الظاهر واسم المستخدم هيخلّوا الناس تعرفك داخل التجربة.">
        <View style={styles.formCard}>
          <AppText style={styles.hint}>الاسم الظاهر: هذا الاسم الذي يراه الناس في تِسوى.</AppText>
          <AppInput placeholder="الاسم الظاهر" value={displayName} onChangeText={setDisplayName} />
          <AppText style={styles.hint}>اسم المستخدم: سيكون معرفك الفريد داخل التجربة.</AppText>
          <AppInput placeholder="اسم المستخدم" autoCapitalize="none" value={username} onChangeText={setUsername} />
          {Boolean(error) && <View style={styles.errorCard}><AppText style={styles.error}>{error}</AppText></View>}
          <AppButton label={loading ? 'جارِ الحفظ...' : 'حفظ والمتابعة'} onPress={submit} />
        </View>
      </AuthExperienceShell>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formCard: { gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(221,208,197,0.9)', borderRadius: 18, padding: spacing.md, backgroundColor: 'rgba(255,253,248,0.92)' },
  hint: { fontSize: 12, opacity: 0.8 },
  errorCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(179,38,30,0.25)', backgroundColor: 'rgba(255,240,239,0.9)', padding: spacing.sm },
  error: { color: '#B3261E', textAlign: 'center' },
});
