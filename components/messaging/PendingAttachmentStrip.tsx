import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';
import { generateDirectVideoThumbnail, type GeneratedVideoThumbnail } from '@/lib/media/video-thumbnails';

export type PendingChatAttachment = {
  id: string;
  kind: 'image' | 'video' | 'file' | 'audio';
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

const createStyles = (colors: TeswaThemeColors) => ({
  wrap: { gap: 7 },
  content: { gap: 8, paddingHorizontal: 1 },
  card: { width: 76, gap: 4, alignItems: 'center' as const },
  preview: { width: 72, height: 72, borderRadius: 13, overflow: 'hidden' as const, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border },
  placeholder: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface },
  close: { position: 'absolute' as const, top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center' as const, justifyContent: 'center' as const },
  name: { width: 72, textAlign: 'center' as const, fontSize: 10.5 },
  progressWrap: { gap: 5, paddingHorizontal: 2 },
  progressMeta: { flexDirection: 'row-reverse' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  progressText: { fontSize: 11.5 },
  progressCount: { fontSize: 11, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' as const, backgroundColor: colors.primarySoft },
  progressFill: { height: '100%' as const, backgroundColor: colors.primary },
});

function PendingVideoThumbnail({ item }: { item: PendingChatAttachment }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const [thumb, setThumb] = useState<GeneratedVideoThumbnail | null>(null);
  useEffect(() => {
    let cancelled = false;
    void generateDirectVideoThumbnail({ videoUrl: item.uri, cacheKeyParts: ['pending', item.id, item.fileName], timeSeconds: 0.5, maxWidth: 180, maxHeight: 180 }).then((next) => {
      if (!cancelled) setThumb(next);
    });
    return () => { cancelled = true; };
  }, [item.fileName, item.id, item.uri]);

  return thumb?.source ? <ExpoImage source={thumb.source as any} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[StyleSheet.absoluteFill, styles.placeholder]}><Ionicons name="videocam-outline" size={19} color={colors.textMuted} /></View>;
}

function AttachmentPreview({ item }: { item: PendingChatAttachment }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  if (item.kind === 'image') return <ExpoImage source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />;
  if (item.kind === 'video') return <PendingVideoThumbnail item={item} />;
  return <View style={[StyleSheet.absoluteFill, styles.placeholder]}><Ionicons name={item.kind === 'audio' ? 'musical-notes-outline' : 'document-outline'} size={20} color={colors.primary} /></View>;
}

export function PendingAttachmentStrip({ items, onRemove, progress }: { items: PendingChatAttachment[]; onRemove: (id: string) => void; progress?: { label: string; done: number; total: number } | null }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
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
                <Pressable accessibilityRole="button" accessibilityLabel="إزالة المرفق" hitSlop={5} onPress={() => onRemove(item.id)} style={styles.close}>
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
              <AppText numberOfLines={1} style={styles.name}>{item.fileName || (item.kind === 'image' ? 'صورة' : item.kind === 'video' ? 'فيديو' : item.kind === 'audio' ? 'صوت' : 'ملف')}</AppText>
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
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} /></View>
        </View>
      ) : null}
    </View>
  );
}
