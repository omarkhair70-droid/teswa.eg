import { File } from 'expo-file-system';

import type { MediaObjectRef, MediaStorageContract, MediaUploadSource } from '@/lib/backend/contracts/media';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

type Options = { transport: OracleHttpTransport; fetchImpl?: typeof fetch };
type UploadGrant = MediaObjectRef & { uploadUrl: string; expiresIn: number };
type Complete = MediaObjectRef & { publicUrl: string | null };

async function readSource(source: MediaUploadSource): Promise<ArrayBuffer> {
  if (source.buffer) return source.buffer;
  try { return await new File(source.uri).arrayBuffer(); }
  catch { return (await fetch(source.uri)).arrayBuffer(); }
}

function cleanName(value: string | null | undefined): string {
  return (value?.trim() || 'upload.bin').toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function keyFor(ownerId: string, source: MediaUploadSource, hint?: string | null): string {
  return hint?.trim() || `${ownerId}/${Date.now()}-${cleanName(source.fileName)}`;
}

export function createOracleMediaStorageAdapter(options: Options): MediaStorageContract {
  const publicUrls = new Map<string, string>();
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = (object: MediaObjectRef) => `${object.purpose}:${object.objectKey}`;
  return {
    async upload(input) {
      if (!input.ownerId?.trim() || !input.source?.uri?.trim()) {
        return { ok: false, reason: 'invalid_source', message: 'Media source is missing.' };
      }
      try {
        const body = await readSource(input.source);
        if (!body.byteLength) return { ok: false, reason: 'invalid_source', message: 'Media source is empty.' };
        if (input.source.maxSizeBytes && body.byteLength > input.source.maxSizeBytes) {
          return { ok: false, reason: 'file_too_large', message: 'Media source exceeds the allowed size.' };
        }
        const object: MediaObjectRef = { purpose: input.purpose,
          objectKey: keyFor(input.ownerId, input.source, input.objectKeyHint),
          contentType: input.source.mimeType?.trim() || null, sizeBytes: body.byteLength };
        const grant = await options.transport.request<UploadGrant>({ method: 'POST', path: '/v1/media/uploads', body: object });
        if (!grant.ok || typeof grant.data.uploadUrl !== 'string') {
          return { ok: false, reason: 'upload_failed', message: 'Oracle upload grant failed.' };
        }
        input.onProgress?.({ loadedBytes: 0, totalBytes: body.byteLength, percent: 0 });
        const uploaded = await fetchImpl(grant.data.uploadUrl, { method: 'PUT',
          headers: { ...(object.contentType ? { 'Content-Type': object.contentType } : {}), 'If-None-Match': '*' },
          body, credentials: 'omit', redirect: 'error' });
        if (!uploaded.ok) return { ok: false, reason: 'upload_failed', message: 'Oracle object upload failed.' };
        input.onProgress?.({ loadedBytes: body.byteLength, totalBytes: body.byteLength, percent: 100 });
        const complete = await options.transport.request<Complete>({ method: 'POST', path: '/v1/media/uploads/complete', body: object });
        if (!complete.ok || complete.data.objectKey !== object.objectKey) {
          await options.transport.request({ method: 'DELETE', path: '/v1/media/objects', body: { objects: [object] } });
          return { ok: false, reason: 'upload_failed', message: 'Oracle upload verification failed.' };
        }
        if (complete.data.publicUrl) publicUrls.set(cacheKey(object), complete.data.publicUrl);
        return { ok: true, data: object };
      } catch (cause) {
        return { ok: false, reason: 'unknown', message: 'Media upload failed.', cause };
      }
    },
    async remove(objects) {
      if (!objects.length) return { ok: true, data: undefined };
      const result = await options.transport.request<{ deleted: number }>({ method: 'DELETE', path: '/v1/media/objects', body: { objects } });
      if (!result.ok || result.data.deleted !== objects.length) return { ok: false, reason: 'delete_failed', message: 'Oracle media cleanup failed.' };
      objects.forEach((object) => publicUrls.delete(cacheKey(object)));
      return { ok: true, data: undefined };
    },
    async getSignedUrl(object, expiresInSeconds = 3600) {
      const result = await options.transport.request<{ signedUrl: string }>({ method: 'POST', path: '/v1/media/signed-url',
        body: { ...object, sizeBytes: object.sizeBytes ?? 1, expiresInSeconds } });
      if (!result.ok) return { ok: false, reason: result.reason === 'not_found' ? 'not_found' : 'sign_failed', message: 'Oracle signed URL failed.' };
      if (typeof result.data.signedUrl !== 'string') return { ok: false, reason: 'sign_failed', message: 'Oracle signed URL was invalid.' };
      return { ok: true, data: result.data.signedUrl };
    },
    getPublicUrl(object) { return publicUrls.get(cacheKey(object)) ?? null; },
    getObjectKeyFromPublicUrl(purpose, url) {
      const marker = '#teswa-object=';
      const value = url?.includes(marker) ? url.slice(url.indexOf(marker) + marker.length) : '';
      const prefix = `${purpose}:`;
      return value.startsWith(prefix) ? value.slice(prefix.length) || null : null;
    },
  };
}
