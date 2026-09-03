import { File } from 'expo-file-system';

import type {
  MediaObjectRef,
  MediaPurpose,
  MediaStorageContract,
  MediaUploadSource,
} from '@/lib/backend/contracts/media';
import { supabase } from '@/lib/supabase/client';

const BUCKET_BY_PURPOSE: Record<MediaPurpose, string> = {
  profile_image: 'profile-images',
  item_image: 'item-images',
  item_video: 'item-videos',
  story_media: 'story-media',
  direct_chat_media: 'direct-chat-media',
  direct_voice: 'direct-voice-messages',
  deal_voice: 'deal-voice-messages',
  contextual_voice: 'contextual-voice-messages',
  dolab_media: 'dolab-media',
};

function bucketFor(purpose: MediaPurpose): string {
  return BUCKET_BY_PURPOSE[purpose];
}

function sanitizeFileName(value: string | null | undefined): string {
  const normalized = (value?.trim() || 'upload.bin').toLowerCase();
  return normalized.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

async function readSource(source: MediaUploadSource): Promise<ArrayBuffer> {
  try {
    return await new File(source.uri).arrayBuffer();
  } catch {
    const response = await fetch(source.uri);
    return response.arrayBuffer();
  }
}

function resolveObjectKey(input: {
  ownerId: string;
  source: MediaUploadSource;
  objectKeyHint?: string | null;
}): string {
  const explicit = input.objectKeyHint?.trim();
  if (explicit) return explicit;
  return `${input.ownerId}/${Date.now()}-${sanitizeFileName(input.source.fileName)}`;
}

export function createSupabaseMediaStorageAdapter(): MediaStorageContract {
  return {
    async upload(input) {
      if (!input.ownerId?.trim() || !input.source?.uri?.trim()) {
        return {
          ok: false,
          reason: 'invalid_source',
          message: 'Media source is missing.',
        };
      }

      const objectKey = resolveObjectKey(input);
      const contentType = input.source.mimeType?.trim() || null;

      try {
        const body = await readSource(input.source);
        if (body.byteLength === 0) {
          return {
            ok: false,
            reason: 'invalid_source',
            message: 'Media source is empty.',
          };
        }

        const { error } = await supabase.storage
          .from(bucketFor(input.purpose))
          .upload(objectKey, body, {
            contentType: contentType ?? undefined,
            upsert: false,
          });

        if (error) {
          return {
            ok: false,
            reason: 'upload_failed',
            message: error.message,
            cause: error,
          };
        }

        return {
          ok: true,
          data: {
            purpose: input.purpose,
            objectKey,
            contentType,
            sizeBytes: input.source.sizeBytes ?? null,
          },
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Media upload failed.',
          cause: error,
        };
      }
    },

    async remove(objects) {
      if (!objects.length) return { ok: true, data: undefined };

      const grouped = new Map<MediaPurpose, string[]>();
      for (const object of objects) {
        const keys = grouped.get(object.purpose) ?? [];
        keys.push(object.objectKey);
        grouped.set(object.purpose, keys);
      }

      try {
        for (const [purpose, objectKeys] of grouped.entries()) {
          const { error } = await supabase.storage.from(bucketFor(purpose)).remove(objectKeys);
          if (error) {
            return {
              ok: false,
              reason: 'delete_failed',
              message: error.message,
              cause: error,
            };
          }
        }

        return { ok: true, data: undefined };
      } catch (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Media cleanup failed.',
          cause: error,
        };
      }
    },

    async getSignedUrl(object, expiresInSeconds = 3600) {
      try {
        const { data, error } = await supabase.storage
          .from(bucketFor(object.purpose))
          .createSignedUrl(object.objectKey, expiresInSeconds);

        if (error || !data?.signedUrl) {
          return {
            ok: false,
            reason: 'sign_failed',
            message: error?.message ?? 'Signed URL was not returned.',
            cause: error ?? undefined,
          };
        }

        return { ok: true, data: data.signedUrl };
      } catch (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: 'Signed URL generation failed.',
          cause: error,
        };
      }
    },

    getPublicUrl(object: MediaObjectRef) {
      const { data } = supabase.storage
        .from(bucketFor(object.purpose))
        .getPublicUrl(object.objectKey);
      return data.publicUrl || null;
    },

    getObjectKeyFromPublicUrl(purpose, url) {
      const trimmed = url?.trim();
      if (!trimmed) return null;

      const marker = `/storage/v1/object/public/${bucketFor(purpose)}/`;
      const markerIndex = trimmed.indexOf(marker);
      if (markerIndex < 0) return null;

      const encodedKey = trimmed.slice(markerIndex + marker.length).split('?')[0];
      if (!encodedKey) return null;

      try {
        return decodeURIComponent(encodedKey);
      } catch {
        return encodedKey;
      }
    },
  };
}
