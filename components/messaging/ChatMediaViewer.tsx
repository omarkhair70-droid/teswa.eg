import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { buildCachedVideoSource } from '@/lib/media/media-performance';

export type ChatMediaViewerItem = {
  kind: 'image' | 'video';
  url: string;
  title?: string | null;
};

function ChatVideoViewer({ url }: { url: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);
  const player = useVideoPlayer(buildCachedVideoSource(url), (instance) => {
    instance.loop = false;
    instance.play();
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (error) setFailed(true);
    if (status === 'readyToPlay' && !readyRef.current) {
      readyRef.current = true;
      setReady(true);
    }
  });

  useEffect(() => () => {
    try { player.pause(); } catch {}
  }, [player]);

  return (
    <View style={styles.videoStage}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: false }}
        contentFit="contain"
      />
      {!ready && !failed ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" />
          <AppText style={styles.loadingText}>بنجهّز الفيديو...</AppText>
        </View>
      ) : null}
      {failed ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <Ionicons name="alert-circle-outline" size={28} color="#fff" />
          <AppText style={styles.loadingText}>تعذر تشغيل الفيديو.</AppText>
        </View>
      ) : null}
    </View>
  );
}

export function ChatMediaViewer({
  item,
  onClose,
}: {
  item: ChatMediaViewerItem | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!item}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {item?.kind === 'image' ? (
          <ExpoImage
            source={{ uri: item.url }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
        {item?.kind === 'video' ? <ChatVideoViewer url={item.url} /> : null}

        {item?.title ? (
          <View pointerEvents="none" style={styles.titleWrap}>
            <AppText numberOfLines={1} style={styles.title}>{item.title}</AppText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إغلاق الميديا"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={25} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '88%' },
  videoStage: { width: '100%', height: '88%', backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  loadingText: { color: '#fff', fontSize: 13 },
  close: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    position: 'absolute',
    left: 20,
    right: 72,
    top: 56,
    alignItems: 'flex-end',
  },
  title: { color: '#fff', fontSize: 13 },
  pressed: { opacity: 0.65 },
});
