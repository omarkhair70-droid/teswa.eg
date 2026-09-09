import type { DolabContract } from '@/lib/backend/contracts/dolab';
import type { DolabItem, DolabMedia, DolabNote } from '@/lib/dolab/types';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const item = (value: unknown): value is DolabItem => record(value) && typeof value.id === 'string' && typeof value.user_id === 'string'
  && typeof value.status === 'string' && typeof value.source === 'string' && typeof value.created_at === 'string';
const media = (value: unknown): value is DolabMedia => record(value) && typeof value.id === 'string' && typeof value.user_id === 'string'
  && typeof value.media_type === 'string' && typeof value.storage_path === 'string' && typeof value.created_at === 'string';
const note = (value: unknown): value is DolabNote => record(value) && typeof value.id === 'string' && typeof value.user_id === 'string'
  && typeof value.note_type === 'string' && typeof value.created_at === 'string';
const failure = (message: string) => ({ ok: false as const, reason: 'unknown' as const, message });

function list<T>(value: unknown, validate: (entry: unknown) => entry is T): T[] | null {
  return record(value) && Array.isArray(value.items) && value.items.every(validate) ? value.items : null;
}

export function createOracleDolabAdapter(transport: OracleHttpTransport): DolabContract {
  return {
    async createItem(userId, input) {
      const result = await transport.request<unknown>({ method: 'POST', path: '/v1/dolab/items', body: { userId, input } });
      return result.ok && record(result.data) && item(result.data.item) ? { ok: true, data: result.data.item } : failure('Oracle Dolab item creation failed.');
    },
    async updateItem(userId, itemId, input) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/items/${itemId}/update`, body: { userId, input } });
      return result.ok && record(result.data) && (result.data.item === null || item(result.data.item)) ? { ok: true, data: result.data.item as DolabItem | null } : failure('Oracle Dolab item update failed.');
    },
    async createNote(input) {
      const result = await transport.request<unknown>({ method: 'POST', path: '/v1/dolab/notes', body: input });
      return result.ok && record(result.data) && note(result.data.note) ? { ok: true, data: result.data.note } : failure('Oracle Dolab note creation failed.');
    },
    async listItems(userId) {
      const result = await transport.request<unknown>({ path: '/v1/dolab/items', query: { userId } }); const data = result.ok ? list(result.data, item) : null;
      return data ? { ok: true, data } : failure('Oracle Dolab item read failed.');
    },
    async listMedia(userId) {
      const result = await transport.request<unknown>({ path: '/v1/dolab/media', query: { userId } }); const data = result.ok ? list(result.data, media) : null;
      return data ? { ok: true, data } : failure('Oracle Dolab media read failed.');
    },
    async listNotes(userId) {
      const result = await transport.request<unknown>({ path: '/v1/dolab/notes', query: { userId } }); const data = result.ok ? list(result.data, note) : null;
      return data ? { ok: true, data } : failure('Oracle Dolab note read failed.');
    },
    async deleteNote(userId, noteId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/notes/${noteId}/delete`, body: { userId } });
      return result.ok ? { ok: true, data: undefined } : failure('Oracle Dolab note delete failed.');
    },
    async deleteItem(userId, itemId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/items/${itemId}/delete`, body: { userId } });
      return result.ok ? { ok: true, data: undefined } : failure('Oracle Dolab item delete failed.');
    },
    async deleteMediaRow(userId, mediaId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/media/${mediaId}/delete`, body: { userId } });
      return result.ok ? { ok: true, data: undefined } : failure('Oracle Dolab media delete failed.');
    },
    async getPublishSource(userId, dolabItemId) {
      const result = await transport.request<unknown>({ path: `/v1/dolab/items/${dolabItemId}/publish-source`, query: { userId } });
      if (!result.ok || !record(result.data) || (result.data.item !== null && !item(result.data.item)) || !Array.isArray(result.data.media) || !result.data.media.every(media)) return failure('Oracle Dolab publish source read failed.');
      return { ok: true, data: { item: result.data.item as DolabItem | null, media: result.data.media as DolabMedia[] } };
    },
    async markItemPublished(userId, dolabItemId, publishedItemId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/items/${dolabItemId}/published`, body: { userId, publishedItemId } });
      return result.ok && record(result.data) && (result.data.item === null || item(result.data.item)) ? { ok: true, data: result.data.item as DolabItem | null } : failure('Oracle Dolab publish link failed.');
    },
    async markNoteShared(userId, noteId, conversationId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/notes/${noteId}/shared`, body: { userId, conversationId } });
      return result.ok ? { ok: true, data: undefined } : failure('Oracle Dolab note share failed.');
    },
    async attachMediaToItem(userId, mediaId, dolabItemId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/media/${mediaId}/attach`, body: { userId, dolabItemId } });
      if (!result.ok) return result.reason === 'not_found' ? { ok: false, reason: 'not_found', message: 'Dolab media was not found.' } : failure('Oracle Dolab media link failed.');
      return record(result.data) && ['linked', 'already_linked', 'linked_elsewhere'].includes(String(result.data.state))
        ? { ok: true, data: { state: result.data.state as 'linked' | 'already_linked' | 'linked_elsewhere' } }
        : failure('Invalid Oracle Dolab media link response.');
    },
    async linkNoteToMedia(userId, noteId, mediaId) {
      const result = await transport.request<unknown>({ method: 'POST', path: `/v1/dolab/notes/${noteId}/media`, body: { userId, mediaId } });
      return result.ok ? { ok: true, data: undefined } : failure('Oracle Dolab note media link failed.');
    },
    async createMediaRow(userId, input) {
      const result = await transport.request<unknown>({ method: 'POST', path: '/v1/dolab/media', body: { userId, input } });
      return result.ok && record(result.data) && media(result.data.media) ? { ok: true, data: result.data.media } : failure('Oracle Dolab media creation failed.');
    },
  };
}
