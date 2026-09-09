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
  if (source.buffer) return source.buffer;
  try {
    return await new File(source.uri).arrayBuffer();
  } catch {
    const response = await fetch(source.uri);
    return response.arrayBuffer();
  }
}

async function uploadWithProgress(input: {
  purpose: MediaPurpose;
  objectKey: string;
  body: ArrayBuffer;
  contentType: string | null;
  onProgress: NonNullable<Parameters<MediaStorageContract['upload']>[0]['onProgress']>;
}): Promise<{ error: Error | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (sessionError || !accessToken || !supabaseUrl || !supabaseAnonKey) {
    return { error: new Error('Media upload session/config is unavailable.') };
  }

  const bucket = bucketFor(input.purpose);
  const encodedObjectKey = encodeURIComponent(input.objectKey).replace(/%2F/g, '/');
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedObjectKey}`;

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    if (input.contentType) xhr.setRequestHeader('Content-Type', input.contentType);

    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : null;
      const percent = totalBytes
        ? Math.min(100, Math.max(0, Math.round((event.loaded / totalBytes) * 100)))
        : null;
      input.onProgress({
        loadedBytes: event.loaded,
        totalBytes,
        percent,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ error: null });
      resolve({ error: new Error(`Upload failed with status ${xhr.status}`) });
    };
    xhr.onerror = () => resolve({ error: new Error('Network error during upload') });
    xhr.onabort = () => resolve({ error: new Error('Upload aborted') });
    xhr.send(input.body);
  });
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
        if (
          typeof input.source.maxSizeBytes === 'number'
          && input.source.maxSizeBytes > 0
          && body.byteLength > input.source.maxSizeBytes
        ) {
          return {
            ok: false,
            reason: 'file_too_large',
            message: 'Media source exceeds the allowed size.',
          };
        }

        let uploadError: Error | null = null;
        if (input.onProgress) {
          const progressResult = await uploadWithProgress({
            purpose: input.purpose,
            objectKey,
            body,
            contentType,
            onProgress: input.onProgress,
          });
          uploadError = progressResult.error;
        } else {
          const { error } = await supabase.storage
            .from(bucketFor(input.purpose))
            .upload(objectKey, body, {
              contentType: contentType ?? undefined,
              upsert: false,
            });
          uploadError = error ? new Error(error.message) : null;
        }

        if (uploadError) {
          return {
            ok: false,
            reason: 'upload_failed',
            message: uploadError.message,
            cause: uploadError,
          };
        }

        return {
          ok: true,
          data: {
            purpose: input.purpose,
            objectKey,
            contentType,
            sizeBytes: input.source.sizeBytes ?? body.byteLength,
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
