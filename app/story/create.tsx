import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoryCameraStudio } from '@/components/story/StoryCameraStudio';
import { StoryStudioPreview } from '@/components/story/StoryStudioPreview';
import { StoryImageComposerSheet } from '@/components/story/StoryImageComposerSheet';
import { StoryPublishOverlay } from '@/components/story/StoryPublishOverlay';
import { StoryPublishSuccessPanel } from '@/components/story/StoryPublishSuccessPanel';
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
    return () => {
      mounted = false;
    };
  }, []);

  const captionTooLong = caption.trim().length > CAPTION_MAX;

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

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً حتى تتمكن من إضافة قصة جديدة." /></AppScreen>;
  if (published) {
    return (
      <AppScreen>
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
      <AppScreen scrollable>
        <View style={styles.content}>
          <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>استوديو القصة</AppText><AppText muted>صوّر لحظة من داخل تِسوى أو اختر وسائط جاهزة، ثم انشرها كقصة تظهر 24 ساعة.</AppText><AppButton label="فتح الاستوديو" onPress={() => setStudioVisible(true)} disabled={publishing} /><AppButton label="اختيار من المعرض" variant="neutral" onPress={() => void pickFromGallery()} disabled={publishing} /></View></AppCard>

          {asset ? <AppCard><View style={styles.group}><StoryStudioPreview asset={asset} /><View style={styles.assetActions}><AppButton label="تغيير الوسائط" variant="neutral" onPress={() => void pickFromGallery()} disabled={publishing} /><AppButton label="تصوير جديد" variant="neutral" onPress={() => setStudioVisible(true)} disabled={publishing} />{asset.type === 'image' ? <AppButton label="تهيئة الصورة" variant="neutral" onPress={() => setImageComposerVisible(true)} disabled={publishing} /> : null}<AppButton label="إزالة" variant="neutral" onPress={() => setAsset(null)} disabled={publishing} /></View></View></AppCard> : null}

          <AppCard><View style={styles.group}><AppInput value={caption} onChangeText={setCaption} placeholder="اكتب تعليقًا قصيرًا (اختياري)" multiline maxLength={240} style={styles.captionInput} editable={!publishing} /><AppText muted style={captionTooLong ? styles.errorText : undefined}>{caption.length}/{CAPTION_MAX}</AppText></View></AppCard>
          {error ? <AppCard><AppText style={styles.errorText}>{error}</AppText></AppCard> : null}
          <AppButton label={publishing ? 'جارٍ نشر القصة...' : 'نشر القصة'} onPress={() => void handlePublish()} disabled={publishing || !asset || captionTooLong} />
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
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  assetActions: { gap: spacing.sm },
  captionInput: { minHeight: 110, textAlignVertical: 'top' },
  errorText: { color: '#B42318' },
});
