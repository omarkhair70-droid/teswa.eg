import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { spacing } from '@/constants/spacing';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { useAuth } from '@/lib/auth';
import { publishStoryFromMobile } from '@/lib/stories';

const CAPTION_MAX = 220;

export default function StoryCreateScreen() {
  const { user } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

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
  const videoDurationLabel = useMemo(() => {
    if (!asset || asset.type !== 'video' || asset.duration == null) return null;
    const seconds = Math.max(0, Math.round(asset.duration / 1000));
    return `${seconds} ثانية`;
  }, [asset]);

  const pickFromCamera = async (mediaType: 'images' | 'videos') => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('نحتاج إذن الكاميرا لإضافة قصة جديدة.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: [mediaType], quality: 0.9 });
      if (result.canceled) return;
      const next = result.assets?.[0] ?? null;
      if (!next) return setError('تعذر قراءة الوسائط المختارة. حاول مرة أخرى.');
      setAsset(next);
      setError(null);
    } catch {
      setError('تعذر فتح الكاميرا حالياً. حاول مرة أخرى.');
    }
  };

  const pickFromGallery = async () => {
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
    const result = await publishStoryFromMobile({ userId: user.id, asset, caption });
    setPublishing(false);
    if (!result.ok) return setError(result.message);
    setPublished(true);
  };

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً حتى تتمكن من إضافة قصة جديدة." /></AppScreen>;
  if (published) return <AppScreen><AppCard><View style={styles.successBox}><AppText weight="bold" style={styles.successTitle}>تم نشر قصتك</AppText><AppText muted>ستظهر لمدة 24 ساعة.</AppText><AppButton label="العودة لحسابي" onPress={() => router.replace('/(tabs)/profile')} /></View></AppCard></AppScreen>;

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>إضافة قصة</AppText><AppText muted>شارك صورة أو فيديو يظهر لمدة 24 ساعة.</AppText></View></AppCard>
        <AppCard><View style={styles.group}><AppButton label="التقط صورة" variant="neutral" onPress={() => void pickFromCamera('images')} /><AppButton label="صوّر فيديو" variant="neutral" onPress={() => void pickFromCamera('videos')} /><AppButton label="اختر من المعرض" variant="neutral" onPress={() => void pickFromGallery()} /></View></AppCard>

        {asset ? <AppCard><View style={styles.group}>
          {asset.type === 'image' ? <ExpoImage source={{ uri: asset.uri }} style={styles.previewImage} contentFit="cover" transition={150} cachePolicy="memory-disk" /> : <View style={styles.videoPreview}><AppText weight="semibold">فيديو جاهز للنشر</AppText>{asset.fileName ? <AppText muted>{asset.fileName}</AppText> : null}{videoDurationLabel ? <AppText muted>المدة: {videoDurationLabel}</AppText> : null}</View>}
          <View style={styles.assetActions}><AppButton label="تغيير الوسائط" variant="neutral" onPress={() => void pickFromGallery()} /><AppButton label="إزالة" variant="neutral" onPress={() => setAsset(null)} /></View>
        </View></AppCard> : null}

        <AppCard><View style={styles.group}><AppInput value={caption} onChangeText={setCaption} placeholder="اكتب تعليقًا قصيرًا (اختياري)" multiline maxLength={240} style={styles.captionInput} /><AppText muted style={captionTooLong ? styles.errorText : undefined}>{caption.length}/{CAPTION_MAX}</AppText></View></AppCard>
        {error ? <AppCard><AppText style={styles.errorText}>{error}</AppText></AppCard> : null}
        <AppButton label={publishing ? 'جارٍ نشر القصة...' : 'نشر القصة'} onPress={() => void handlePublish()} disabled={publishing || !asset || captionTooLong} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl }, group: { gap: spacing.sm }, title: { fontSize: 22 },
  previewImage: { width: '100%', height: 280, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  videoPreview: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, borderStyle: 'dashed', padding: spacing.md, gap: spacing.xs },
  assetActions: { gap: spacing.sm }, captionInput: { minHeight: 110, textAlignVertical: 'top' }, successBox: { gap: spacing.md }, successTitle: { fontSize: 20 }, errorText: { color: '#B00020' },
});
