import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoryCameraStudio } from '@/components/story/StoryCameraStudio';
import { StoryStudioPreview } from '@/components/story/StoryStudioPreview';
import { StoryImageComposerSheet } from '@/components/story/StoryImageComposerSheet';
import { StoryPublishOverlay } from '@/components/story/StoryPublishOverlay';
import { StoryPublishSuccessPanel } from '@/components/story/StoryPublishSuccessPanel';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { publishStoryFromMobile, StoryPublishProgress } from '@/lib/stories';

const CAPTION_MAX = 220;

export default function StoryCreateScreen() {
  const { user } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<StoryPublishProgress | null>(null);
  const [published, setPublished] = useState(false);
  const [studioVisible, setStudioVisible] = useState(false);
  const [imageComposerVisible, setImageComposerVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    const recoverPendingPicker = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (!mounted || !pending || !('canceled' in pending) || pending.canceled || 'code' in pending) return;
        const pendingAsset = pending.assets?.[0] ?? null;
        if (pendingAsset) {
          setAsset(pendingAsset);
          setError(null);
        }
      } catch (err) {
        if (__DEV__) console.log('[story-create] pending picker recovery failed', err);
      }
    };
    void recoverPendingPicker();
    return () => { mounted = false; };
  }, []);

  const captionTooLong = caption.trim().length > CAPTION_MAX;
  const mediaLabel = asset?.type === 'video' ? 'فيديو' : asset?.type === 'image' ? 'صورة' : null;

  const pickFromGallery = async () => {
    if (publishing) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: 0.9 });
      if (result.canceled) return;
      const next = result.assets?.[0] ?? null;
      if (!next) return setError('تعذر قراءة الوسائط المختارة. حاول مرة أخرى.');
      setAsset(next);
      setError(null);
    } catch {
      setError('تعذر فتح المعرض حالياً. حاول مرة أخرى.');
    }
  };

  const handlePublish = async () => {
    if (!user?.id) return setError('يجب تسجيل الدخول أولاً.');
    if (!asset) return setError('اختر صورة أو فيديو أولاً.');
    if (captionTooLong) return setError('تعليق القصة أطول من الحد المسموح.');
    setPublishing(true);
    setError(null);
    setPublishProgress(null);
    const result = await publishStoryFromMobile({ userId: user.id, asset, caption, onProgress: setPublishProgress });
    setPublishing(false);
    if (!result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPublishProgress(null);
      return setError(result.message);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPublished(true);
  };

  if (!user) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً حتى تتمكن من إضافة قصة جديدة." /></AppScreen>;
  if (published) {
    return (
      <AppScreen backgroundVariant="alive">
        <StoryPublishSuccessPanel
          onViewStory={() => router.replace(`/story/${user.id}`)}
          onCreateAnother={() => {
            setPublished(false);
            setAsset(null);
            setCaption('');
            setError(null);
            setPublishProgress(null);
          }}
          onManageStories={() => router.replace('/story/manage')}
          onReturnProfile={() => router.replace('/(tabs)/profile')}
        />
      </AppScreen>
    );
  }

  return (
    <>
      <AppScreen scrollable backgroundVariant="alive">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
          <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>شارك لحظة</AppText><AppText weight="bold" style={styles.title}>قصة جديدة</AppText><AppText muted style={styles.subtitle}>صورة أو فيديو، تعليق خفيف، وتفضل ظاهرة لمدة 24 ساعة.</AppText></View>
        </View>

        <View style={styles.studioSurface}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}><Ionicons name="camera-outline" size={21} color={colors.primary} /></View>
            <View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>1 · الوسائط</AppText><AppText weight="bold" style={styles.sectionTitle}>{asset ? 'المعاينة جاهزة' : 'اختار اللحظة'}</AppText></View>
            {mediaLabel ? <View style={styles.mediaTypePill}><AppText style={styles.mediaTypeText}>{mediaLabel}</AppText></View> : null}
          </View>

          {asset ? (
            <View style={styles.previewStack}>
              <View style={styles.previewFrame}><StoryStudioPreview asset={asset} /></View>
              <View style={styles.mediaActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="تغيير الوسائط" disabled={publishing} onPress={() => void pickFromGallery()} style={styles.mediaAction}><Ionicons name="images-outline" size={17} color={colors.text} /><AppText weight="semibold" style={styles.mediaActionText}>تغيير</AppText></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="تصوير جديد" disabled={publishing} onPress={() => setStudioVisible(true)} style={styles.mediaAction}><Ionicons name="camera-outline" size={17} color={colors.text} /><AppText weight="semibold" style={styles.mediaActionText}>تصوير</AppText></Pressable>
                {asset.type === 'image' ? <Pressable accessibilityRole="button" accessibilityLabel="تهيئة الصورة" disabled={publishing} onPress={() => setImageComposerVisible(true)} style={styles.mediaAction}><Ionicons name="options-outline" size={17} color={colors.text} /><AppText weight="semibold" style={styles.mediaActionText}>تهيئة</AppText></Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="إزالة الوسائط" disabled={publishing} onPress={() => setAsset(null)} style={styles.iconAction}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyMedia}>
              <View style={styles.emptyMediaIcon}><Ionicons name="sparkles-outline" size={29} color={colors.primary} /></View>
              <AppText weight="bold" style={styles.emptyMediaTitle}>ابدأ من الكاميرا أو المعرض</AppText>
              <AppText muted style={styles.emptyMediaText}>القصة مصممة للحظات السريعة؛ صورة واحدة أو فيديو واحد كفاية.</AppText>
              <View style={styles.primaryActions}><AppButton label="فتح الكاميرا" onPress={() => setStudioVisible(true)} disabled={publishing} /><AppButton label="اختيار من المعرض" variant="neutral" onPress={() => void pickFromGallery()} disabled={publishing} /></View>
            </View>
          )}
        </View>

        <View style={styles.captionSurface}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, styles.captionIcon]}><Ionicons name="text-outline" size={21} color={colors.accent} /></View>
            <View style={styles.sectionCopy}><AppText muted style={styles.eyebrow}>2 · الكلام</AppText><AppText weight="bold" style={styles.sectionTitle}>ضيف تعليق لو محتاج</AppText></View>
            <AppText muted style={[styles.counter, captionTooLong && styles.counterDanger]}>{caption.length}/{CAPTION_MAX}</AppText>
          </View>
          <AppInput value={caption} onChangeText={setCaption} placeholder="مثال: لسه وصلت ودي أول تجربة ليها 👀" multiline maxLength={240} style={styles.captionInput} editable={!publishing} />
          <AppText muted style={styles.helper}>اختياري. خليه قصير وواضح عشان الصورة أو الفيديو يفضلوا هم الأساس.</AppText>
        </View>

        {error ? <View style={styles.errorStrip}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}

        <View style={styles.publishPanel}>
          <View style={styles.publishCopy}><AppText muted style={styles.eyebrow}>قبل النشر</AppText><AppText weight="bold" style={styles.publishTitle}>{asset ? 'القصة جاهزة' : 'اختار وسائط الأول'}</AppText><AppText muted style={styles.publishHint}>هتختفي تلقائيًا بعد 24 ساعة، وتقدر تحذفها قبلها من إدارة القصص.</AppText></View>
          <AppButton label={publishing ? 'جارٍ نشر القصة...' : 'نشر القصة'} onPress={() => void handlePublish()} disabled={publishing || !asset || captionTooLong} loading={publishing} fullWidth />
        </View>
      </AppScreen>

      <StoryCameraStudio visible={studioVisible} onClose={() => setStudioVisible(false)} onCaptured={(capturedAsset) => { setAsset(capturedAsset); setError(null); setStudioVisible(false); }} />
      <StoryPublishOverlay visible={publishing} progress={publishProgress} asset={asset} />
      <StoryImageComposerSheet
        visible={imageComposerVisible}
        originalAsset={asset?.type === 'image' ? asset : null}
        onClose={() => setImageComposerVisible(false)}
        onUseComposedImage={(composedAsset) => {
          setAsset(composedAsset);
          setError(null);
          setImageComposerVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  subtitle: { lineHeight: 21, textAlign: 'right' },
  studioSurface: { gap: spacing.lg, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  captionSurface: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  captionIcon: { backgroundColor: colors.accentSoft },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  mediaTypePill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  mediaTypeText: { color: colors.primary, fontSize: 10 },
  previewStack: { gap: spacing.md },
  previewFrame: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.background },
  mediaActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  mediaAction: { minHeight: 40, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  mediaActionText: { fontSize: 11 },
  iconAction: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  emptyMedia: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(184,98,63,0.35)', backgroundColor: '#FFF9F4' },
  emptyMediaIcon: { width: 62, height: 62, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  emptyMediaTitle: { fontSize: 18, textAlign: 'center' },
  emptyMediaText: { maxWidth: 290, textAlign: 'center', lineHeight: 20 },
  primaryActions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  captionInput: { minHeight: 118, textAlignVertical: 'top' },
  counter: { fontSize: 11 },
  counterDanger: { color: colors.danger },
  helper: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  errorStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, lineHeight: 19, textAlign: 'right' },
  publishPanel: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.primarySoft },
  publishCopy: { alignItems: 'flex-end', gap: 3 },
  publishTitle: { fontSize: 17, textAlign: 'right' },
  publishHint: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
});
