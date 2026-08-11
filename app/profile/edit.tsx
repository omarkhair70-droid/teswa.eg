import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
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
import { USERNAME_MAX_LENGTH, USERNAME_RULES_AR, validateUsername } from '@/lib/username';

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
  const coverPreviewUri = coverDraft?.uri || coverUrl;
  const avatarPreviewUri = avatarDraft?.uri || avatarUrl;
  const hasImageDraft = Boolean(coverDraft || avatarDraft);

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

  useEffect(() => { void loadProfile(); }, [loadProfile]);

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
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9 });
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
      const result = await removeProfileImageFromMobile({ userId: user.id, kind, currentImageUrl: kind === 'avatar' ? avatarUrl : coverUrl });
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
    const usernameValidation = validateUsername(username);
    const normalizedTaglineLength = profileTagline.trim().length;
    if (!normalizedDisplayName) {
      setFormError('الاسم الظاهر مطلوب.');
      return;
    }
    if (!usernameValidation.ok) {
      setFormError(usernameValidation.message);
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
      const result = await updateMyProfileFromMobile({ userId: user.id, displayName, username: usernameValidation.normalized, profileTagline, city, area, bio });
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

  if (!user?.id) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="يجب تسجيل الدخول" description="سجّل دخولك أولاً لتعديل ملفك." /><AppButton label="العودة لملفي" variant="neutral" onPress={() => router.replace('/(tabs)/profile')} /></View></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="alive"><View style={styles.loadingStack}><View style={styles.loadingCover} /><View style={styles.loadingAvatar} /><View style={styles.loadingLine} /><View style={styles.loadingCard} /></View></AppScreen>;
  if (loadError) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="تعذر تحميل ملفك" description={loadError} /><AppButton label="إعادة المحاولة" onPress={() => void loadProfile()} /><AppButton label="العودة لملفي" variant="neutral" onPress={() => router.replace('/(tabs)/profile')} /></View></AppScreen>;
  if (missingProfile) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="الملف غير موجود" description="تعذر العثور على بيانات حسابك حالياً." /><AppButton label="العودة لملفي" variant="neutral" onPress={() => router.replace('/(tabs)/profile')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع لملفي" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>هويتك على تِسوى</AppText><AppText weight="bold" style={styles.title}>تعديل الملف</AppText><AppText muted style={styles.subtitle}>أي حاجة هنا هي اللي الناس هتشوفها لما تفتح ملفك.</AppText></View>
      </View>

      <View style={styles.visualEditor}>
        <View style={styles.coverWrap}>
          {coverPreviewUri ? <ExpoImage source={{ uri: coverPreviewUri }} style={styles.coverPreview} contentFit="cover" transition={120} /> : <View style={styles.coverPlaceholder}><Ionicons name="image-outline" size={28} color={colors.textMuted} /><AppText muted style={styles.coverPlaceholderText}>ضيف غلاف يدي الملف شخصية</AppText></View>}
          <View style={styles.coverTopRow}><View style={styles.mediaLabel}><Ionicons name="image-outline" size={13} color={colors.white} /><AppText style={styles.mediaLabelText}>الغلاف</AppText></View>{coverDraft ? <View style={styles.draftPill}><AppText style={styles.draftText}>تغيير غير محفوظ</AppText></View> : null}</View>
          <View style={styles.coverActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="اختيار غلاف من المعرض" disabled={imageBusy !== null} onPress={() => void pickProfileImage('cover', 'gallery')} style={styles.floatingAction}><Ionicons name="images-outline" size={16} color={colors.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="التقاط غلاف بالكاميرا" disabled={imageBusy !== null} onPress={() => void pickProfileImage('cover', 'camera')} style={styles.floatingAction}><Ionicons name="camera-outline" size={16} color={colors.text} /></Pressable>
          </View>
        </View>

        <View style={styles.avatarEditorRow}>
          <View style={styles.avatarWrap}>
            {avatarPreviewUri ? <ExpoImage source={{ uri: avatarPreviewUri }} style={styles.avatarPreview} contentFit="cover" transition={120} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person-outline" size={28} color={colors.primary} /></View>}
            {avatarDraft ? <View style={styles.avatarDraftDot} /> : null}
          </View>
          <View style={styles.avatarCopy}><AppText muted style={styles.eyebrow}>صورة الملف</AppText><AppText weight="bold" style={styles.avatarTitle}>{displayName.trim() || 'اسمك هيظهر هنا'}</AppText><AppText muted style={styles.avatarHint}>صورة واضحة بتخلي الحساب أسهل في التعرف والثقة.</AppText></View>
          <View style={styles.avatarActions}><Pressable accessibilityRole="button" accessibilityLabel="اختيار صورة من المعرض" disabled={imageBusy !== null} onPress={() => void pickProfileImage('avatar', 'gallery')} style={styles.roundAction}><Ionicons name="images-outline" size={17} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="التقاط صورة بالكاميرا" disabled={imageBusy !== null} onPress={() => void pickProfileImage('avatar', 'camera')} style={styles.roundAction}><Ionicons name="camera-outline" size={17} color={colors.primary} /></Pressable></View>
        </View>

        {(coverDraft || avatarDraft) ? (
          <View style={styles.pendingMediaPanel}>
            <View style={styles.pendingMediaCopy}><Ionicons name="cloud-upload-outline" size={18} color={colors.primary} /><View style={styles.pendingMediaText}><AppText weight="semibold">احفظ الصور المختارة</AppText><AppText muted style={styles.microcopy}>الصور بتتحفظ منفصلة عن البيانات النصية عشان الرفع يفضل آمن.</AppText></View></View>
            {coverDraft ? <View style={styles.imageSaveRow}><AppButton label={imageBusy === 'cover_upload' ? 'جارٍ حفظ الغلاف...' : 'حفظ الغلاف'} onPress={() => void handleSaveProfileImage('cover')} disabled={imageBusy !== null} /><AppButton label="إلغاء" variant="neutral" onPress={() => setCoverDraft(null)} disabled={imageBusy !== null} /></View> : null}
            {avatarDraft ? <View style={styles.imageSaveRow}><AppButton label={imageBusy === 'avatar_upload' ? 'جارٍ حفظ الصورة...' : 'حفظ صورة الملف'} onPress={() => void handleSaveProfileImage('avatar')} disabled={imageBusy !== null} /><AppButton label="إلغاء" variant="neutral" onPress={() => setAvatarDraft(null)} disabled={imageBusy !== null} /></View> : null}
          </View>
        ) : null}

        {!hasImageDraft && (coverUrl || avatarUrl) ? (
          <View style={styles.removeRow}>{coverUrl ? <Pressable accessibilityRole="button" accessibilityLabel="حذف الغلاف" disabled={imageBusy !== null} onPress={() => void handleRemoveProfileImage('cover')} style={styles.removeAction}><Ionicons name="trash-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.removeText}>حذف الغلاف</AppText></Pressable> : null}{avatarUrl ? <Pressable accessibilityRole="button" accessibilityLabel="حذف صورة الملف" disabled={imageBusy !== null} onPress={() => void handleRemoveProfileImage('avatar')} style={styles.removeAction}><Ionicons name="trash-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.removeText}>حذف الصورة</AppText></Pressable> : null}</View>
        ) : null}
      </View>

      {imageError ? <Feedback tone="danger" text={imageError} /> : null}
      {imageSuccess ? <Feedback tone="success" text={imageSuccess} /> : null}
      {formError ? <Feedback tone="danger" text={formError} /> : null}
      {successMessage ? <View style={styles.successPanel}><Ionicons name="checkmark-circle" size={22} color={colors.success} /><View style={styles.successCopy}><AppText weight="bold" style={styles.successTitle}>اتحفظت التعديلات</AppText><AppText muted style={styles.successText}>{successMessage}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="عرض ملفي" onPress={() => router.push(`/profile/${user.id}`)} style={styles.viewProfileButton}><Ionicons name="eye-outline" size={17} color={colors.primary} /></Pressable></View> : null}

      <View style={styles.formSection}>
        <SectionHeading icon="person-outline" eyebrow="الأساس" title="هويتك" description="الاسم واسم المستخدم هما أسرع حاجة الناس بتتعرف بيها عليك." />
        <View style={styles.fieldGroup}><AppText weight="semibold" style={styles.fieldLabel}>الاسم الظاهر</AppText><AppInput placeholder="اسمك على تِسوى" value={displayName} onChangeText={(value) => { setDisplayName(value); if (formError) setFormError(null); }} /></View>
        <View style={styles.fieldGroup}><View style={styles.fieldTop}><AppText weight="semibold" style={styles.fieldLabel}>اسم المستخدم</AppText><AppText muted style={styles.fieldCounter}>{username.length}/{USERNAME_MAX_LENGTH}</AppText></View><AppInput placeholder="username" value={username} onChangeText={(value) => { setUsername(value); if (formError) setFormError(null); }} autoCapitalize="none" autoCorrect={false} spellCheck={false} maxLength={USERNAME_MAX_LENGTH} /><AppText muted style={styles.helper}>{USERNAME_RULES_AR}</AppText></View>
      </View>

      <View style={styles.formSection}>
        <SectionHeading icon="sparkles-outline" eyebrow="الحضور" title="قول حاجة عنك بسرعة" description="الجملة دي بتبان في الملف وبتدي انطباع قبل النبذة الطويلة." />
        <View style={styles.fieldGroup}><View style={styles.fieldTop}><AppText weight="semibold" style={styles.fieldLabel}>الجملة التعريفية</AppText><AppText muted style={[styles.fieldCounter, taglineCount > 120 && styles.counterDanger]}>{taglineCount}/120</AppText></View><AppInput placeholder="مثال: بحب الكاميرات والحاجات القديمة" value={profileTagline} onChangeText={(value) => { setProfileTagline(value); if (formError) setFormError(null); }} maxLength={130} /></View>
        <View style={styles.locationFields}><View style={styles.locationField}><AppText weight="semibold" style={styles.fieldLabel}>المدينة</AppText><AppInput placeholder="القاهرة" value={city} onChangeText={setCity} /></View><View style={styles.locationField}><AppText weight="semibold" style={styles.fieldLabel}>المنطقة</AppText><AppInput placeholder="مدينة نصر" value={area} onChangeText={setArea} /></View></View>
      </View>

      <View style={styles.formSection}>
        <SectionHeading icon="chatbox-ellipses-outline" eyebrow="عنّي" title="نبذة تخلي الملف إنساني" description="اكتب اللي يفيد اللي هيتعامل معاك: اهتمامات، أسلوب التبديل، أو الحاجات اللي بتحبها." />
        <AppInput placeholder="اكتب نبذة قصيرة عنك..." value={bio} onChangeText={setBio} multiline numberOfLines={5} />
      </View>

      <View style={styles.savePanel}>
        <View style={styles.saveCopy}><AppText muted style={styles.eyebrow}>جاهز؟</AppText><AppText weight="bold" style={styles.saveTitle}>احفظ بيانات الملف</AppText><AppText muted style={styles.saveHint}>التغييرات النصية هنا مستقلة عن رفع الصور اللي فوق.</AppText></View>
        <View style={styles.saveActions}><View style={styles.savePrimary}><AppButton label={saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'} onPress={() => void handleSave()} disabled={saving} loading={saving} fullWidth /></View><View style={styles.saveCancel}><AppButton label="إلغاء" variant="neutral" onPress={() => router.back()} disabled={saving} fullWidth /></View></View>
      </View>
    </AppScreen>
  );
}

function SectionHeading({ icon, eyebrow, title, description }: { icon: keyof typeof Ionicons.glyphMap; eyebrow: string; title: string; description: string }) {
  return <View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>{eyebrow}</AppText><AppText weight="bold" style={styles.sectionTitle}>{title}</AppText><AppText muted style={styles.sectionDescription}>{description}</AppText></View></View>;
}

function Feedback({ tone, text }: { tone: 'danger' | 'success'; text: string }) {
  const danger = tone === 'danger';
  return <View style={[styles.feedbackPanel, danger ? styles.feedbackDanger : styles.feedbackSuccess]}><Ionicons name={danger ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={18} color={danger ? colors.danger : colors.success} /><AppText style={[styles.feedbackText, { color: danger ? colors.danger : colors.success }]}>{text}</AppText></View>;
}

const styles = StyleSheet.create({
  stateStack: { gap: spacing.sm },
  loadingStack: { gap: spacing.md },
  loadingCover: { height: 180, borderRadius: radii.xl, backgroundColor: '#EEE7DF' },
  loadingAvatar: { width: 92, height: 92, borderRadius: radii.round, backgroundColor: '#E5DBD1', marginTop: -55, marginRight: spacing.lg },
  loadingLine: { width: '48%', height: 15, borderRadius: 8, backgroundColor: '#EEE7DF', alignSelf: 'flex-end' },
  loadingCard: { height: 180, borderRadius: radii.xl, backgroundColor: '#F3E7DB' },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  subtitle: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  visualEditor: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  coverWrap: { height: 190, backgroundColor: colors.background },
  coverPreview: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: '#EEE7DF' },
  coverPlaceholderText: { fontSize: 11 },
  coverTopRow: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  mediaLabel: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: 'rgba(28,25,23,0.68)' },
  mediaLabelText: { color: colors.white, fontSize: 9 },
  draftPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.primary },
  draftText: { color: colors.white, fontSize: 9 },
  coverActions: { position: 'absolute', bottom: spacing.sm, left: spacing.sm, flexDirection: 'row-reverse', gap: spacing.xs },
  floatingAction: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
  avatarEditorRow: { minHeight: 118, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingTop: spacing.lg },
  avatarWrap: { width: 82, height: 82, borderRadius: radii.round, overflow: 'hidden', borderWidth: 4, borderColor: colors.surface, backgroundColor: colors.primarySoft },
  avatarPreview: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarDraftDot: { position: 'absolute', right: 2, bottom: 2, width: 16, height: 16, borderRadius: radii.round, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface },
  avatarCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  avatarTitle: { fontSize: 17, textAlign: 'right' },
  avatarHint: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  avatarActions: { gap: spacing.xs },
  roundAction: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  pendingMediaPanel: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FFF9F4' },
  pendingMediaCopy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  pendingMediaText: { flex: 1, alignItems: 'flex-end', gap: 2 },
  microcopy: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  imageSaveRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  removeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  removeAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: colors.background },
  removeText: { fontSize: 9 },
  feedbackPanel: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg },
  feedbackDanger: { backgroundColor: colors.dangerSoft },
  feedbackSuccess: { backgroundColor: colors.successSoft },
  feedbackText: { flex: 1, fontSize: 11, lineHeight: 17, textAlign: 'right' },
  successPanel: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  successCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  successTitle: { color: colors.success },
  successText: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  viewProfileButton: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  formSection: { gap: spacing.lg, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  sectionIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  sectionDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  fieldGroup: { gap: spacing.sm },
  fieldTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fieldLabel: { fontSize: 12, textAlign: 'right' },
  fieldCounter: { fontSize: 10 },
  counterDanger: { color: colors.danger },
  helper: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  locationFields: { gap: spacing.md },
  locationField: { flex: 1, gap: spacing.sm },
  savePanel: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.primarySoft, marginBottom: spacing.xl },
  saveCopy: { alignItems: 'flex-end', gap: 2 },
  saveTitle: { fontSize: 18, textAlign: 'right' },
  saveHint: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  saveActions: { flexDirection: 'row-reverse', gap: spacing.sm },
  savePrimary: { flex: 1.3 },
  saveCancel: { flex: 0.7 },
});
