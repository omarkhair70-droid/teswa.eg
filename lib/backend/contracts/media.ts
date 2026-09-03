import type { TeswaResult } from '@/lib/backend/contracts/core';

export type MediaPurpose =
  | 'profile_image'
  | 'item_image'
  | 'item_video'
  | 'story_media'
  | 'direct_chat_media'
  | 'direct_voice'
  | 'deal_voice'
  | 'contextual_voice'
  | 'dolab_media';

export type MediaUploadSource = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type MediaObjectRef = {
  purpose: MediaPurpose;
  objectKey: string;
  contentType: string | null;
  sizeBytes: number | null;
};

export interface MediaStorageContract {
  upload(input: {
    purpose: MediaPurpose;
    ownerId: string;
    source: MediaUploadSource;
    objectKeyHint?: string | null;
  }): Promise<TeswaResult<MediaObjectRef, 'invalid_source' | 'upload_failed' | 'unknown'>>;

  remove(objects: MediaObjectRef[]): Promise<TeswaResult<void, 'delete_failed' | 'unknown'>>;
  getSignedUrl(object: MediaObjectRef, expiresInSeconds?: number): Promise<TeswaResult<string, 'not_found' | 'sign_failed' | 'unknown'>>;
  getPublicUrl(object: MediaObjectRef): string | null;
}
