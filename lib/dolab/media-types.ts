export type DolabPendingMediaType = 'image' | 'video' | 'audio';

export type DolabPendingMediaUploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed';

export type DolabCompressionStatus = 'not_needed' | 'pending' | 'compressing' | 'compressed' | 'failed';

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
  remoteMediaId?: string;
  storagePath?: string;
  uploadStatus?: DolabPendingMediaUploadStatus;
  uploadError?: string;
  originalUri?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  compressionStatus?: DolabCompressionStatus;
  compressionError?: string;
};
