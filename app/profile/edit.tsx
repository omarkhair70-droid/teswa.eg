import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { removeProfileImageFromMobile, replaceProfileImageFromMobile, type ProfileImageKind } from '@/lib/profile-images';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarDraft, setAvatarDraft] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [coverDraft, setCoverDraft] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageBusy, setImageBusy] = useState<null | 'avatar_upload' | 'cover_upload' | 'avatar_remove' | 'cover_remove'>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);

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
      setAvatarUrl(profile.avatar_url ?? null);
      setCoverUrl(profile.cover_url ?? null);
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

  const pickProfileImage = useCallback(async (kind: ProfileImageKind, source: 'camera' | 'gallery') => {
    if (imageBusy) return;
    setImageError(null);
    setImageSuccess(null);

    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setImageError('نحتاج إذن الكاميرا لاختيار هذه الصورة.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          quality: 0.9,
        });
      }

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setImageError('تعذر قراءة الصورة المختارة.');
        return;
      }
      if (kind === 'avatar') setAvatarDraft(asset);
      else setCoverDraft(asset);
    } catch {
      setImageError(source === 'camera' ? 'تعذر فتح الكاميرا حالياً.' : 'تعذر فتح المعرض حالياً.');
    }
  }, [imageBusy]);

  const handleSaveProfileImage = useCallback(async (kind: ProfileImageKind) => {
    if (!user?.id) {
      setImageError('يجب تسجيل الدخول أولاً لتحديث صور الملف.');
      return;
    }

    const draft = kind === 'avatar' ? avatarDraft : coverDraft;
    if (!draft) {
      setImageError('اختر صورة أولاً.');
      return;
    }

    setImageBusy(kind === 'avatar' ? 'avatar_upload' : 'cover_upload');
    setImageError(null);
    setImageSuccess(null);
    try {
      const result = await replaceProfileImageFromMobile({
        userId: user.id,
        kind,
        asset: draft,
        previousImageUrl: kind === 'avatar' ? avatarUrl : coverUrl,
      });
      if (!result.ok) {
        setImageError(result.message);
        return;
      }
      setImageSuccess(result.message);
      if (kind === 'avatar') {
        setAvatarUrl(result.imageUrl);
        setAvatarDraft(null);
      } else {
        setCoverUrl(result.imageUrl);
        setCoverDraft(null);
      }
    } finally {
      setImageBusy(null);
    }
  }, [avatarDraft, avatarUrl, coverDraft, coverUrl, user?.id]);

  const handleRemoveProfileImage = useCallback(async (kind: ProfileImageKind) => {
    if (!user?.id) {
      setImageError('يجب تسجيل الدخول أولاً لتحديث صور الملف.');
      return;
    }
    setImageBusy(kind === 'avatar' ? 'avatar_remove' : 'cover_remove');
    setImageError(null);
    setImageSuccess(null);
    try {
      const result = await removeProfileImageFromMobile({
        userId: user.id,
        kind,
        currentImageUrl: kind === 'avatar' ? avatarUrl : coverUrl,
      });
      if (!result.ok) {
        setImageError(result.message);
        return;
      }
      setImageSuccess(result.message);
      if (kind === 'avatar') {
        setAvatarUrl(null);
        setAvatarDraft(null);
      } else {
        setCoverUrl(null);
        setCoverDraft(null);
      }
    } finally {
      setImageBusy(null);
    }
  }, [avatarUrl, coverUrl, user?.id]);

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
            <AppCard>
              <View style={styles.group}>
                <AppText weight="bold">صور الملف</AppText>
                <AppText muted>حدّث صورتك الشخصية وغلاف ملفك. يتم حفظ الصور بشكل منفصل عن النصوص.</AppText>

                <View style={styles.group}>
                  <AppText weight="bold">الغلاف</AppText>
                  {coverDraft?.uri || coverUrl ? (
                    <ExpoImage source={{ uri: coverDraft?.uri || coverUrl || '' }} style={styles.coverPreview} contentFit="cover" />
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <AppText muted>لا يوجد غلاف بعد</AppText>
                    </View>
                  )}
                  <View style={styles.actions}>
                    <AppButton label="اختر غلافًا من المعرض" variant="neutral" onPress={() => void pickProfileImage('cover', 'gallery')} disabled={imageBusy !== null} />
                    <AppButton label="التقط غلافًا" variant="neutral" onPress={() => void pickProfileImage('cover', 'camera')} disabled={imageBusy !== null} />
                    {coverDraft ? (
                      <>
                        <AppButton label="حفظ الغلاف" onPress={() => void handleSaveProfileImage('cover')} disabled={imageBusy !== null} />
                        <AppButton label="إلغاء التغيير" variant="neutral" onPress={() => setCoverDraft(null)} disabled={imageBusy !== null} />
                      </>
                    ) : null}
                    {coverUrl && !coverDraft ? (
                      <AppButton label="حذف الغلاف" variant="neutral" onPress={() => void handleRemoveProfileImage('cover')} disabled={imageBusy !== null} />
                    ) : null}
                  </View>
                </View>

                <View style={styles.group}>
                  <AppText weight="bold">صورة الملف</AppText>
                  {avatarDraft?.uri || avatarUrl ? (
                    <ExpoImage source={{ uri: avatarDraft?.uri || avatarUrl || '' }} style={styles.avatarPreview} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <AppText>؟</AppText>
                    </View>
                  )}
                  <View style={styles.actions}>
                    <AppButton label="اختر صورة من المعرض" variant="neutral" onPress={() => void pickProfileImage('avatar', 'gallery')} disabled={imageBusy !== null} />
                    <AppButton label="التقط صورة" variant="neutral" onPress={() => void pickProfileImage('avatar', 'camera')} disabled={imageBusy !== null} />
                    {avatarDraft ? (
                      <>
                        <AppButton label="حفظ صورة الملف" onPress={() => void handleSaveProfileImage('avatar')} disabled={imageBusy !== null} />
                        <AppButton label="إلغاء التغيير" variant="neutral" onPress={() => setAvatarDraft(null)} disabled={imageBusy !== null} />
                      </>
                    ) : null}
                    {avatarUrl && !avatarDraft ? (
                      <AppButton label="حذف صورة الملف" variant="neutral" onPress={() => void handleRemoveProfileImage('avatar')} disabled={imageBusy !== null} />
                    ) : null}
                  </View>
                </View>
              </View>
            </AppCard>

            {imageError ? (
              <AppCard>
                <AppText style={styles.errorText}>{imageError}</AppText>
              </AppCard>
            ) : null}
            {imageSuccess ? (
              <AppCard>
                <AppText>{imageSuccess}</AppText>
              </AppCard>
            ) : null}

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
  coverPreview: {
    width: '100%',
    height: 170,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  coverPlaceholder: {
    width: '100%',
    height: 170,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  avatarPreview: {
    width: 96,
    height: 96,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
