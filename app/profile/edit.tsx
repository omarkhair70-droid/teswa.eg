import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchMyAccountProfile, updateMyProfileFromMobile } from '@/lib/profiles';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function EditProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingProfile, setMissingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [profileTagline, setProfileTagline] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');

  const taglineCount = useMemo(() => profileTagline.trim().length, [profileTagline]);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setMissingProfile(false);

    try {
      const profile = await fetchMyAccountProfile(user.id);
      if (!profile) {
        setMissingProfile(true);
        return;
      }

      setDisplayName(profile.display_name ?? '');
      setUsername(profile.username ?? '');
      setProfileTagline(profile.profile_tagline ?? '');
      setCity(profile.city ?? '');
      setArea(profile.area ?? '');
      setBio(profile.bio ?? '');
    } catch (error) {
      if (__DEV__) console.log('[EditProfile] load failed', error);
      setLoadError('تعذر تحميل بيانات ملفك حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = useCallback(async () => {
    if (!user?.id) {
      setFormError('يجب تسجيل الدخول أولاً لتعديل الملف.');
      return;
    }

    const normalizedDisplayName = displayName.trim();
    const normalizedUsername = username.trim();
    const normalizedTaglineLength = profileTagline.trim().length;

    if (!normalizedDisplayName) {
      setFormError('الاسم الظاهر مطلوب.');
      return;
    }

    if (!normalizedUsername || !USERNAME_REGEX.test(normalizedUsername)) {
      setFormError('اسم المستخدم لازم يكون من 3 إلى 20 حرف أو رقم أو _.');
      return;
    }

    if (normalizedTaglineLength > 120) {
      setFormError('الجملة التعريفية يجب ألا تتجاوز 120 حرفًا.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const result = await updateMyProfileFromMobile({
        userId: user.id,
        displayName,
        username,
        profileTagline,
        city,
        area,
        bio,
      });

      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      await refreshProfile();
      setSuccessMessage(result.message);
    } finally {
      setSaving(false);
    }
  }, [area, bio, city, displayName, profileTagline, refreshProfile, user?.id, username]);

  if (!user?.id) {
    return (
      <AppScreen>
        <View style={styles.group}>
          <EmptyState
            title="يجب تسجيل الدخول"
            description="سجّل دخولك أولاً لتعديل ملفك."
          />
          <AppButton
            label="العودة لحسابي"
            variant="neutral"
            onPress={() => router.replace('/(tabs)/profile')}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        {loading ? <AppText muted>جاري تحميل بيانات الملف...</AppText> : null}

        {!loading && loadError ? (
          <AppCard>
            <View style={styles.group}>
              <AppText style={styles.errorText}>{loadError}</AppText>
              <AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadProfile()} />
            </View>
          </AppCard>
        ) : null}

        {!loading && !loadError && missingProfile ? (
          <View style={styles.group}>
            <EmptyState
              title="الملف غير موجود"
              description="تعذر العثور على بيانات حسابك حالياً."
            />
            <AppButton
              label="العودة لحسابي"
              variant="neutral"
              onPress={() => router.replace('/(tabs)/profile')}
            />
          </View>
        ) : null}

        {!loading && !loadError && !missingProfile ? (
          <>
            <AppCard>
              <View style={styles.group}>
                <AppText weight="bold" style={styles.title}>تعديل ملفي</AppText>
                <AppText muted>عدّل المعلومات التي تظهر للناس في ملفك العام.</AppText>
              </View>
            </AppCard>

            {formError ? (
              <AppCard>
                <AppText style={styles.errorText}>{formError}</AppText>
              </AppCard>
            ) : null}

            {successMessage ? (
              <AppCard>
                <View style={styles.group}>
                  <AppText>{successMessage}</AppText>
                  <AppButton label="العودة لحسابي" onPress={() => router.replace('/(tabs)/profile')} />
                  <AppButton label="عرض ملفي العام" variant="neutral" onPress={() => router.push(`/profile/${user.id}`)} />
                </View>
              </AppCard>
            ) : null}

            <AppCard>
              <View style={styles.group}>
                <AppInput placeholder="الاسم الظاهر" value={displayName} onChangeText={setDisplayName} />
                <AppInput
                  placeholder="اسم المستخدم"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <AppText muted>من 3 إلى 20 حرفًا أو رقمًا أو _.</AppText>
                <AppInput placeholder="جملة تعريفية قصيرة" value={profileTagline} onChangeText={setProfileTagline} />
                <AppText muted>{`${taglineCount}/120`}</AppText>
                <AppInput placeholder="المدينة" value={city} onChangeText={setCity} />
                <AppInput placeholder="المنطقة" value={area} onChangeText={setArea} />
                <AppInput
                  placeholder="اكتب نبذة قصيرة عنك"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={5}
                />
                <View style={styles.actions}>
                  <AppButton label={saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'} onPress={() => void handleSave()} disabled={saving} />
                  <AppButton label="إلغاء" variant="neutral" onPress={() => router.back()} disabled={saving} />
                </View>
              </View>
            </AppCard>
          </>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  errorText: { color: '#B42318' },
});
