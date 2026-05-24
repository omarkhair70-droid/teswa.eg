import type { ImagePickerAsset } from 'expo-image-picker';
import type { DolabPendingMedia, DolabPendingMediaType } from '@/lib/dolab/media-types';

export function toPendingMedia(asset: ImagePickerAsset, mediaType: DolabPendingMediaType): DolabPendingMedia {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    uri: asset.uri,
    mediaType,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    durationMs: asset.duration ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    sizeBytes: asset.fileSize ?? undefined,
    createdAt: new Date().toISOString(),
  };
}
