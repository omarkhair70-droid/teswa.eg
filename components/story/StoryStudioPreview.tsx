import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export type StoryStudioPreviewProps = {
  asset: ImagePicker.ImagePickerAsset;
};

export function StoryStudioPreview({ asset }: StoryStudioPreviewProps) {
  const player = useVideoPlayer(asset.type === 'video' ? asset.uri : null, (instance) => {
    instance.loop = true;
  });

  const durationLabel = useMemo(() => {
    if (asset.duration == null) return null;
    const seconds = Math.max(0, Math.round(asset.duration / 1000));
    return `${seconds} ثانية`;
  }, [asset.duration]);

  if (asset.type === 'image') {
    return <ExpoImage source={{ uri: asset.uri }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" transition={150} />;
  }

  if (asset.type === 'video') {
    return (
      <View style={styles.videoWrap}>
        <VideoView style={styles.video} player={player} nativeControls={false} fullscreenOptions={{ enable: false }} />
        <View style={styles.videoControls}>
          <Pressable style={styles.controlButton} onPress={() => player.play()}><AppText weight="semibold">تشغيل</AppText></Pressable>
          <Pressable style={styles.controlButton} onPress={() => player.pause()}><AppText weight="semibold">إيقاف</AppText></Pressable>
        </View>
        {asset.fileName ? <AppText muted>{asset.fileName}</AppText> : null}
        {durationLabel ? <AppText muted>المدة: {durationLabel}</AppText> : null}
      </View>
    );
  }

  return <View style={styles.fallback}><AppText muted>وسائط جاهزة للمراجعة</AppText></View>;
}

const styles = StyleSheet.create({
  previewImage: { width: '100%', height: 280, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  videoWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm, gap: spacing.sm, backgroundColor: colors.surface },
  video: { width: '100%', height: 280, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.background },
  videoControls: { flexDirection: 'row', gap: spacing.sm },
  controlButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  fallback: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.md, padding: spacing.md },
});
