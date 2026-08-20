import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';
import { generateDirectVideoThumbnail, type GeneratedVideoThumbnail } from '@/lib/media/video-thumbnails';

export type ChatAttachmentGalleryItem = {
  id: string;
  kind: 'image' | 'video' | 'file';
  uri: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storagePath?: string | null;
  storageBucket?: 'direct-chat-media' | 'direct-voice-messages' | null;
};

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

const createStyles = (colors: TeswaThemeColors) => ({
  wrap: { width: 264, maxWidth: '100%' as const, gap: 7 },
  mediaLarge: { width: 264, maxWidth: '100%' as const, height: 224, borderRadius: 16, overflow: 'hidden' as const, backgroundColor: colors.background },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, width: 264, maxWidth: '100%' as const },
  mediaGrid: { width: 130, height: 130, borderRadius: 13, overflow: 'hidden' as const, backgroundColor: colors.background },
  videoFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface },
  videoPlay: { position: 'absolute' as const, alignSelf: 'center' as const, top: '50%' as const, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center' as const, justifyContent: 'center' as const, paddingLeft: 2 },
  preparingOverlay: { position: 'absolute' as const, right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.elevated, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: colors.border },
  fileCard: { width: 264, maxWidth: '100%' as const, minHeight: 58, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 9, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  fileCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' as const, gap: 2 },
  fileMeta: { fontSize: 10.5 },
  pressed: { opacity: 0.68 },
});

function VideoThumb({ item }: { item: ChatAttachmentGalleryItem }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const [thumb, setThumb] = useState<GeneratedVideoThumbnail | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!item.uri) {
      setThumb(null);
      return;
    }
    void generateDirectVideoThumbnail({ videoUrl: item.uri, cacheKeyParts: [item.id, item.fileName], maxWidth: 540, maxHeight: 540 }).then((next) => {
      if (!cancelled) setThumb(next);
    });
    return () => { cancelled = true; };
  }, [item.fileName, item.id, item.uri]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {thumb?.source ? <ExpoImage source={thumb.source as any} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[StyleSheet.absoluteFill, styles.videoFallback]}><Ionicons name="videocam-outline" size={26} color={colors.textMuted} /></View>}
      <View style={styles.videoPlay}><Ionicons name="play" size={18} color={colors.white} /></View>
    </View>
  );
}

function MediaTile({ item, size, onPress }: { item: ChatAttachmentGalleryItem; size: 'large' | 'grid'; onPress: () => void }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.kind === 'video' ? 'فتح الفيديو' : 'فتح الصورة'} onPress={onPress} style={({ pressed }) => [size === 'large' ? styles.mediaLarge : styles.mediaGrid, pressed && styles.pressed]}>
      {item.kind === 'image' && item.uri ? (
        <ExpoImage source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={80} />
      ) : item.kind === 'video' ? <VideoThumb item={item} /> : <View style={[StyleSheet.absoluteFill, styles.videoFallback]}><Ionicons name="image-outline" size={24} color={colors.textMuted} /></View>}
      {!item.uri ? <View pointerEvents="none" style={styles.preparingOverlay}><Ionicons name="cloud-download-outline" size={17} color={colors.textMuted} /></View> : null}
    </Pressable>
  );
}

export function ChatAttachmentGallery({ items, onPress }: { items: ChatAttachmentGalleryItem[]; onPress: (item: ChatAttachmentGalleryItem) => void }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const media = useMemo(() => items.filter((item) => item.kind === 'image' || item.kind === 'video'), [items]);
  const files = useMemo(() => items.filter((item) => item.kind === 'file'), [items]);

  return (
    <View style={styles.wrap}>
      {media.length === 1 ? <MediaTile item={media[0]} size="large" onPress={() => onPress(media[0])} /> : media.length > 1 ? <View style={styles.grid}>{media.map((item) => <MediaTile key={item.id} item={item} size="grid" onPress={() => onPress(item)} />)}</View> : null}
      {files.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityLabel="فتح الملف" onPress={() => onPress(item)} style={({ pressed }) => [styles.fileCard, pressed && styles.pressed]}>
          <View style={styles.fileIcon}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View>
          <View style={styles.fileCopy}>
            <AppText weight="semibold" numberOfLines={1}>{item.fileName || 'ملف'}</AppText>
            <AppText muted numberOfLines={1} style={styles.fileMeta}>{[formatFileSize(item.sizeBytes), item.mimeType].filter(Boolean).join(' • ') || (item.uri ? 'اضغط للفتح' : 'جاري تجهيز الملف...')}</AppText>
          </View>
          <Ionicons name={item.uri ? 'open-outline' : 'cloud-download-outline'} size={17} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}
