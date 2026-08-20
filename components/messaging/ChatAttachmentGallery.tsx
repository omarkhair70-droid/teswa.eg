import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { generateDirectVideoThumbnail, type GeneratedVideoThumbnail } from '@/lib/media/video-thumbnails';

export type ChatAttachmentGalleryItem = {
  id: string;
  kind: 'image' | 'video' | 'file';
  uri: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function VideoThumb({ item }: { item: ChatAttachmentGalleryItem }) {
  const [thumb, setThumb] = useState<GeneratedVideoThumbnail | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!item.uri) {
      setThumb(null);
      return;
    }
    void generateDirectVideoThumbnail({
      videoUrl: item.uri,
      cacheKeyParts: [item.id, item.fileName],
      maxWidth: 540,
      maxHeight: 540,
    }).then((next) => {
      if (!cancelled) setThumb(next);
    });
    return () => { cancelled = true; };
  }, [item.fileName, item.id, item.uri]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {thumb?.source ? (
        <ExpoImage source={thumb.source as any} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.videoFallback]}>
          <Ionicons name="videocam-outline" size={26} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.videoPlay}>
        <Ionicons name="play" size={18} color="#fff" />
      </View>
    </View>
  );
}

function MediaTile({
  item,
  size,
  onPress,
  moreCount,
}: {
  item: ChatAttachmentGalleryItem;
  size: 'large' | 'grid';
  onPress: () => void;
  moreCount?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.kind === 'video' ? 'فتح الفيديو' : 'فتح الصورة'}
      onPress={onPress}
      style={({ pressed }) => [size === 'large' ? styles.mediaLarge : styles.mediaGrid, pressed && styles.pressed]}
    >
      {item.kind === 'image' && item.uri ? (
        <ExpoImage source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={80} />
      ) : item.kind === 'video' ? (
        <VideoThumb item={item} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.videoFallback]}>
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      {moreCount && moreCount > 0 ? (
        <View style={styles.moreOverlay}>
          <AppText weight="bold" style={styles.moreText}>+{moreCount}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChatAttachmentGallery({
  items,
  onPress,
}: {
  items: ChatAttachmentGalleryItem[];
  onPress: (item: ChatAttachmentGalleryItem) => void;
}) {
  const media = useMemo(() => items.filter((item) => item.kind === 'image' || item.kind === 'video'), [items]);
  const files = useMemo(() => items.filter((item) => item.kind === 'file'), [items]);
  const visibleMedia = media.slice(0, 4);
  const moreCount = Math.max(0, media.length - visibleMedia.length);

  return (
    <View style={styles.wrap}>
      {visibleMedia.length === 1 ? (
        <MediaTile item={visibleMedia[0]} size="large" onPress={() => onPress(visibleMedia[0])} />
      ) : visibleMedia.length > 1 ? (
        <View style={styles.grid}>
          {visibleMedia.map((item, index) => (
            <MediaTile
              key={item.id}
              item={item}
              size="grid"
              onPress={() => onPress(item)}
              moreCount={index === visibleMedia.length - 1 ? moreCount : 0}
            />
          ))}
        </View>
      ) : null}

      {files.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel="فتح الملف"
          onPress={() => onPress(item)}
          style={({ pressed }) => [styles.fileCard, pressed && styles.pressed]}
        >
          <View style={styles.fileIcon}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.fileCopy}>
            <AppText weight="semibold" numberOfLines={1}>{item.fileName || 'ملف'}</AppText>
            <AppText muted numberOfLines={1} style={styles.fileMeta}>
              {[formatFileSize(item.sizeBytes), item.mimeType].filter(Boolean).join(' • ') || (item.uri ? 'اضغط للفتح' : 'جاري تجهيز الملف...')}
            </AppText>
          </View>
          <Ionicons name="open-outline" size={17} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 264, maxWidth: '100%', gap: 7 },
  mediaLarge: {
    width: 264,
    maxWidth: '100%',
    height: 224,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: 264, maxWidth: '100%' },
  mediaGrid: {
    width: 130,
    height: 130,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  videoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  videoPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  moreText: { color: '#fff', fontSize: 25 },
  fileCard: {
    width: 264,
    maxWidth: '100%',
    minHeight: 58,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  fileMeta: { fontSize: 10.5 },
  pressed: { opacity: 0.68 },
});
