import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { generateDirectVideoThumbnail, type GeneratedVideoThumbnail } from '@/lib/media/video-thumbnails';

export type PendingChatAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file' | 'audio';
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

function PendingVideoThumbnail({ item }: { item: PendingChatAttachment }) {
  const [thumb, setThumb] = useState<GeneratedVideoThumbnail | null>(null);
  useEffect(() => {
    let cancelled = false;
    void generateDirectVideoThumbnail({
      videoUrl: item.uri,
      cacheKeyParts: ['pending', item.id, item.fileName],
      timeSeconds: 0.5,
      maxWidth: 180,
      maxHeight: 180,
    }).then((next) => {
      if (!cancelled) setThumb(next);
    });
    return () => { cancelled = true; };
  }, [item.fileName, item.id, item.uri]);

  return thumb?.source ? (
    <ExpoImage source={thumb.source as any} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
      <Ionicons name="videocam-outline" size={19} color={colors.textMuted} />
    </View>
  );
}

function AttachmentPreview({ item }: { item: PendingChatAttachment }) {
  if (item.kind === 'image') {
    return <ExpoImage source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />;
  }
  if (item.kind === 'video') return <PendingVideoThumbnail item={item} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
      <Ionicons name={item.kind === 'audio' ? 'musical-notes-outline' : 'document-outline'} size={20} color={colors.primary} />
    </View>
  );
}

export function PendingAttachmentStrip({
  items,
  onRemove,
  progress,
}: {
  items: PendingChatAttachment[];
  onRemove: (id: string) => void;
  progress?: { label: string; done: number; total: number } | null;
}) {
  if (!items.length && !progress) return null;
  const ratio = progress && progress.total > 0 ? Math.max(0, Math.min(1, progress.done / progress.total)) : 0;

  return (
    <View style={styles.wrap}>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.preview}>
                <AttachmentPreview item={item} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="إزالة المرفق"
                  hitSlop={5}
                  onPress={() => onRemove(item.id)}
                  style={styles.close}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
              <AppText numberOfLines={1} style={styles.name}>
                {item.fileName || (item.kind === 'image' ? 'صورة' : item.kind === 'video' ? 'فيديو' : item.kind === 'audio' ? 'صوت' : 'ملف')}
              </AppText>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {progress ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressMeta}>
            <AppText muted style={styles.progressText}>{progress.label}</AppText>
            <AppText muted style={styles.progressCount}>{Math.min(progress.done, progress.total)}/{progress.total}</AppText>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  content: { gap: 8, paddingHorizontal: 1 },
  card: { width: 76, gap: 4, alignItems: 'center' },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  close: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { width: 72, textAlign: 'center', fontSize: 10.5 },
  progressWrap: { gap: 5, paddingHorizontal: 2 },
  progressMeta: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 11.5 },
  progressCount: { fontSize: 11, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.primarySoft },
  progressFill: { height: '100%', backgroundColor: colors.primary },
});
