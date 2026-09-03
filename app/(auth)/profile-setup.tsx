import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { teswaBackendRuntime } from '@/lib/backend/runtime';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_RULES_AR,
  validateUsername,
} from '@/lib/username';

const UPSERT_TIMEOUT_MS = 12_000;

const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export default function ProfileSetupScreen() {
  const { user, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const saveProfileOnce = (
    userId: string,
    normalizedUsername: string,
  ) =>
    withTimeout(
      teswaBackendRuntime.profiles.setupMine({
        userId,
        displayName: displayName.trim(),
        username: normalizedUsername,
      }),
      UPSERT_TIMEOUT_MS,
      'PROFILE_UPSERT_TIMEOUT',
    );

  const submit = async () => {
    if (!user || loading) return;

    const currentUserId = user.id;
    const normalizedDisplayName = displayName.trim();

    if (!normalizedDisplayName) {
      setError('اكتب الاسم الظاهر للمتابعة.');
      return;
    }

    const usernameValidation = validateUsername(username);

    if (!usernameValidation.ok) {
      setError(usernameValidation.message);
      return;
    }

    const handleUpsertError = (upsertError: { code?: string }) => {
      if (__DEV__) {
        console.log('[ProfileSetup] upsert error', upsertError);
      }

      if (upsertError.code === '23505') {
        setError('اسم المستخدم مستخدم بالفعل. جرّب اسمًا آخر.');
        return;
      }

      setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
    };

    try {
      setLoading(true);
      setError('');

      const attemptOneResult = await saveProfileOnce(
        currentUserId,
        usernameValidation.normalized,
      );

      if (!attemptOneResult.ok) {
        handleUpsertError({
          code: attemptOneResult.reason === 'username_taken' ? '23505' : undefined,
        });
        return;
      }

      await refreshProfile();
      router.replace('/(auth)/policy-acceptance');
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        submitError.message === 'PROFILE_UPSERT_TIMEOUT'
      ) {
        if (__DEV__) {
          console.log('[ProfileSetup] upsert timeout, retrying once');
        }

        try {
          if (__DEV__) {
            console.log('[ProfileSetup] upsert attempt 2 started');
          }

          const attemptTwoResult = await saveProfileOnce(
            currentUserId,
            usernameValidation.normalized,
          );

          if (!attemptTwoResult.ok) {
            handleUpsertError({
              code: attemptTwoResult.reason === 'username_taken' ? '23505' : undefined,
            });
            return;
          }

          await refreshProfile();
          router.replace('/(auth)/policy-acceptance');
          return;
        } catch (retryError) {
          if (__DEV__) {
            console.log('[ProfileSetup] retry failed', retryError);
          }

          if (
            retryError instanceof Error &&
            retryError.message === 'PROFILE_UPSERT_TIMEOUT'
          ) {
            setError(
              'استغرق حفظ البيانات وقتًا أطول من المتوقع. حاول مرة تانية.',
            );
            return;
          }

          setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
          return;
        }
      }

      if (__DEV__) {
        console.log('[ProfileSetup] save failed', submitError);
      }

      setError('حصل خطأ أثناء حفظ البيانات. حاول مرة تانية.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell
        eyebrow="آخر خطوة"
        icon="person-circle-outline"
        title="كمّل حضورك في تِسوى"
        body="اسمك الظاهر واسم المستخدم هيخلّوا الناس تعرفك داخل التجربة."
      >
        <View style={styles.formCard}>
          <AppText style={styles.hint}>
            الاسم الظاهر: هذا الاسم الذي يراه الناس في تِسوى.
          </AppText>

          <AppInput
            placeholder="الاسم الظاهر"
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError('');
            }}
          />

          <AppText style={styles.hint}>{USERNAME_RULES_AR}</AppText>

          <AppInput
            placeholder="اسم المستخدم"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            maxLength={USERNAME_MAX_LENGTH}
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              if (error) setError('');
            }}
          />

          {Boolean(error) && (
            <View style={styles.errorCard}>
              <AppText style={styles.error}>{error}</AppText>
            </View>
          )}

          <AppButton
            label={loading ? 'جارِ الحفظ...' : 'حفظ والمتابعة'}
            onPress={submit}
            disabled={loading}
          />
        </View>
      </AuthExperienceShell>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.9)',
    borderRadius: 18,
    padding: spacing.md,
    backgroundColor: 'rgba(255,253,248,0.92)',
  },
  hint: {
    fontSize: 12,
    opacity: 0.8,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(179,38,30,0.25)',
    backgroundColor: 'rgba(255,240,239,0.9)',
    padding: spacing.sm,
  },
  error: {
    color: '#B3261E',
    textAlign: 'center',
  },
});