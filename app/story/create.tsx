import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoryCameraStudio } from '@/components/story/StoryCameraStudio';
import { StoryStudioPreview } from '@/components/story/StoryStudioPreview';
import { spacing } from '@/constants/spacing';
import { colors } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { publishStoryFromMobile, StoryPublishProgress } from '@/lib/stories';

const CAPTION_MAX = 220;

function UploadProgressRing({ percent }: { percent: number }) {
  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <View style={styles.progressRingWrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="transparent" />
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.primary} strokeWidth={strokeWidth} strokeLinecap="round" fill="transparent" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={styles.progressLabelCenter}><AppText weight="bold">{Math.round(clamped)}%</AppText></View>
    </View>
  );
}

export default function StoryCreateScreen() {
  const { user } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<StoryPublishProgress | null>(null);
  const [published, setPublished] = useState(false);
  const [studioVisible, setStudioVisible] = useState(false);

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
      setPublishProgress(null);
      return setError(result.message);
    }
    setPublished(true);
  };

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً حتى تتمكن من إضافة قصة جديدة." /></AppScreen>;
  if (published) {
    return (
      <AppScreen>
        <AppCard>
          <View style={styles.successBox}>
            <AppText weight="bold" style={styles.successTitle}>تم نشر قصتك</AppText>
            <AppText muted>ستظهر لمدة 24 ساعة.</AppText>
            <AppButton label="عرض قصتي الآن" onPress={() => router.replace(`/story/${user.id}`)} />
            <AppButton label="إدارة قصصي" variant="neutral" onPress={() => router.replace('/story/manage')} />
            <AppButton label="العودة لحسابي" variant="neutral" onPress={() => router.replace('/(tabs)/profile')} />
          </View>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <>
      <AppScreen scrollable>
        <View style={styles.content}>
          <AppCard><View style={styles.group}><AppText weight="bold" style={styles.title}>استوديو القصة</AppText><AppText muted>صوّر لحظة من داخل تِسوى أو اختر وسائط جاهزة، ثم انشرها كقصة تظهر 24 ساعة.</AppText><AppButton label="فتح الاستوديو" onPress={() => setStudioVisible(true)} disabled={publishing} /><AppButton label="اختيار من المعرض" variant="neutral" onPress={() => void pickFromGallery()} disabled={publishing} /></View></AppCard>

          {asset ? <AppCard><View style={styles.group}><StoryStudioPreview asset={asset} /><View style={styles.assetActions}><AppButton label="تغيير الوسائط" variant="neutral" onPress={() => void pickFromGallery()} disabled={publishing} /><AppButton label="تصوير جديد" variant="neutral" onPress={() => setStudioVisible(true)} disabled={publishing} /><AppButton label="إزالة" variant="neutral" onPress={() => setAsset(null)} disabled={publishing} /></View></View></AppCard> : null}

          <AppCard><View style={styles.group}><AppInput value={caption} onChangeText={setCaption} placeholder="اكتب تعليقًا قصيرًا (اختياري)" multiline maxLength={240} style={styles.captionInput} editable={!publishing} /><AppText muted style={captionTooLong ? styles.errorText : undefined}>{caption.length}/{CAPTION_MAX}</AppText></View></AppCard>
          {publishing && publishProgress ? (
            <AppCard>
              <View style={styles.publishingCard}>
                <AppText weight="bold">جارٍ نشر قصتك</AppText>
                {typeof publishProgress.uploadPercent === 'number' ? <UploadProgressRing percent={publishProgress.uploadPercent} /> : <View style={styles.indeterminateDot} />}
                <AppText muted>{publishProgress.message}</AppText>
              </View>
            </AppCard>
          ) : null}
          {error ? <AppCard><AppText style={styles.errorText}>{error}</AppText></AppCard> : null}
          <AppButton label={publishing ? 'جارٍ نشر القصة...' : 'نشر القصة'} onPress={() => void handlePublish()} disabled={publishing || !asset || captionTooLong} />
        </View>
      </AppScreen>
      <StoryCameraStudio visible={studioVisible} onClose={() => setStudioVisible(false)} onCaptured={(capturedAsset) => { setAsset(capturedAsset); setError(null); setStudioVisible(false); }} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  assetActions: { gap: spacing.sm },
  captionInput: { minHeight: 110, textAlignVertical: 'top' },
  successBox: { gap: spacing.md },
  successTitle: { fontSize: 20 },
  errorText: { color: '#B42318' },
  publishingCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  progressRingWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  progressLabelCenter: { position: 'absolute' },
  indeterminateDot: { width: 14, height: 14, borderRadius: 999, backgroundColor: colors.primarySoft },
});
