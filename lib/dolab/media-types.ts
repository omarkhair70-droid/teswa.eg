export type DolabPendingMediaType = 'image' | 'video' | 'audio';

export type DolabPendingMedia = {
  id: string;
  uri: string;
  mediaType: DolabPendingMediaType;
  fileName?: string;
  mimeType?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  createdAt: string;
};
