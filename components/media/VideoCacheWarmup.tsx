import { useVideoPlayer } from 'expo-video';
import { buildCachedVideoSource } from '@/lib/media/media-performance';

export type VideoCacheWarmupProps = {
  uri: string | null | undefined;
};

export function VideoCacheWarmup({ uri }: VideoCacheWarmupProps) {
  const source = buildCachedVideoSource(uri);
  useVideoPlayer(source, () => {});
  return null;
}
