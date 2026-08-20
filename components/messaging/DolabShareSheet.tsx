import { forwardRef, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { generateDirectVideoThumbnail, type GeneratedVideoThumbnail } from '@/lib/media/video-thumbnails';

export type DolabShareItem = {
  id: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'file';
  title: string;
  body?: string;
  uri?: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
};

function DolabVideoThumb({ item }: { item: DolabShareItem }) {
  const [thumb, setThumb] = useState<GeneratedVideoThumbnail | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!item.uri) return;
    void generateDirectVideoThumbnail({
      videoUrl: item.uri,
      cacheKeyParts: ['dolab-share', item.id, item.fileName],
      timeSeconds: 0.5,
      maxWidth: 180,
      maxHeight: 180,
    }).then((value) => { if (!cancelled) setThumb(value); });
    return () => { cancelled = true; };
  }, [item.fileName, item.id, item.uri]);
  return thumb?.source ? (
    <ExpoImage source={thumb.source as any} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
  ) : (
    <Ionicons name="videocam-outline" size={20} color={colors.textMuted} />
  );
}

function ItemPreview({ item }: { item: DolabShareItem }) {
  if (item.kind === 'image' && item.uri) {
    return <ExpoImage source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />;
  }
  if (item.kind === 'video') return <DolabVideoThumb item={item} />;
  return <Ionicons name={item.kind === 'audio' ? 'musical-notes-outline' : item.kind === 'text' ? 'document-text-outline' : 'document-outline'} size={20} color={colors.primary} />;
}

export const DolabShareSheet = forwardRef<BottomSheetModal, {
  items: DolabShareItem[];
  loading?: boolean;
  error?: string | null;
  onSelect: (item: DolabShareItem) => void;
  onReload?: () => void;
}>(function DolabShareSheet({ items, loading = false, error, onSelect, onReload }, ref) {
  const selectAndClose = (item: DolabShareItem) => {
    onSelect(item);
    if (ref && typeof ref !== 'function') ref.current?.dismiss();
  };

  return (
    <AppBottomSheet
      ref={ref}
      title="من الدولاب"
      description="اختار ملاحظة أو ميديا وابعتها في المحادثة."
      titleIconName="file-tray-stacked-outline"
      snapPoints={['62%', '88%']}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View style={styles.state}>
            <AppText muted>بنفتح الدولاب...</AppText>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <AppText style={styles.error}>{error}</AppText>
            {onReload ? <Pressable onPress={onReload}><AppText weight="semibold" style={styles.retry}>حاول تاني</AppText></Pressable> : null}
          </View>
        ) : items.length ? (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`اختيار ${item.title}`}
              onPress={() => selectAndClose(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.preview}><ItemPreview item={item} /></View>
              <View style={styles.copy}>
                <AppText weight="semibold" numberOfLines={1}>{item.title}</AppText>
                <AppText muted numberOfLines={2} style={styles.meta}>
                  {item.body?.trim() || (item.kind === 'image' ? 'صورة' : item.kind === 'video' ? 'فيديو' : item.kind === 'audio' ? 'صوت' : 'ملف')}
                </AppText>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </Pressable>
          ))
        ) : (
          <View style={styles.state}>
            <Ionicons name="file-tray-outline" size={27} color={colors.textMuted} />
            <AppText weight="semibold">الدولاب فاضي دلوقتي</AppText>
            <AppText muted style={styles.center}>احفظ حاجة في الدولاب وهتقدر تبعتها من هنا.</AppText>
          </View>
        )}
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
});

const styles = StyleSheet.create({
  content: { gap: 8, paddingBottom: 22 },
  row: {
    minHeight: 72,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  preview: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  meta: { fontSize: 11.5, textAlign: 'right' },
  state: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 20 },
  center: { textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center' },
  retry: { color: colors.primary },
  pressed: { opacity: 0.68 },
});
