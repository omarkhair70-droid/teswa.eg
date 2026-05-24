import type { ImagePickerAsset } from 'expo-image-picker';
import type { DolabPendingMedia, DolabPendingMediaType } from '@/lib/dolab/media-types';

function fileNameFromUri(uri: string): string | undefined {
  const chunk = uri.split('/').pop();
  return chunk && chunk.length > 0 ? decodeURIComponent(chunk) : undefined;
}

export function toPendingMedia(asset: ImagePickerAsset, mediaType: DolabPendingMediaType): DolabPendingMedia {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    uri: asset.uri,
    mediaType,
    fileName: asset.fileName ?? fileNameFromUri(asset.uri),
    mimeType: asset.mimeType ?? undefined,
    durationMs: typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration : undefined,
    width: typeof asset.width === 'number' && asset.width > 0 ? asset.width : undefined,
    height: typeof asset.height === 'number' && asset.height > 0 ? asset.height : undefined,
    sizeBytes: typeof asset.fileSize === 'number' && asset.fileSize > 0 ? asset.fileSize : undefined,
    createdAt: new Date().toISOString(),
    uploadStatus: 'local',
  };
}


export function createPendingAudioMedia(input: { uri: string; durationMs?: number; mimeType?: string }): DolabPendingMedia {
  return {
    id: `local-audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    uri: input.uri,
    mediaType: 'audio',
    fileName: 'ملاحظة صوتية',
    mimeType: input.mimeType ?? 'audio/m4a',
    durationMs: typeof input.durationMs === 'number' && input.durationMs > 0 ? input.durationMs : undefined,
    createdAt: new Date().toISOString(),
    uploadStatus: 'local',
  };
}

export function formatMediaDuration(ms?: number): string | undefined {
  if (!ms || ms <= 0) return undefined;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMediaDimensions(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  return `${width}×${height}`;
}

export function formatMediaSize(sizeBytes?: number): string | undefined {
  if (!sizeBytes || sizeBytes <= 0) return undefined;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
