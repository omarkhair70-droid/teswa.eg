import type { TeswaResult } from '@/lib/backend/contracts/core';
import type {
  DolabItem,
  DolabItemSource,
  DolabItemStatus,
  DolabMedia,
  DolabMediaType,
  DolabNote,
  DolabNoteType,
} from '@/lib/dolab/types';

export type DolabItemWriteInput = {
  title: string | null;
  description: string | null;
  category: string | null;
  condition: string | null;
  exchangeIntent: string | null;
  status: Extract<DolabItemStatus, 'draft' | 'ready'>;
  source: DolabItemSource;
};

export type DolabMediaWriteInput = {
  dolabItemId: string | null;
  mediaType: DolabMediaType;
  storagePath: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
};

export type DolabLinkMediaResult =
  | { state: 'linked' }
  | { state: 'already_linked' }
  | { state: 'linked_elsewhere' };

export interface DolabContract {
  createItem(
    userId: string,
    input: DolabItemWriteInput,
  ): Promise<TeswaResult<DolabItem, 'unknown'>>;

  updateItem(
    userId: string,
    itemId: string,
    input: DolabItemWriteInput,
  ): Promise<TeswaResult<DolabItem | null, 'unknown'>>;

  createNote(input: {
    userId: string;
    body: string | null;
    noteType: DolabNoteType;
    dolabItemId: string | null;
    mediaId: string | null;
  }): Promise<TeswaResult<DolabNote, 'unknown'>>;

  listItems(userId: string): Promise<TeswaResult<DolabItem[], 'unknown'>>;
  listMedia(userId: string): Promise<TeswaResult<DolabMedia[], 'unknown'>>;
  listNotes(userId: string): Promise<TeswaResult<DolabNote[], 'unknown'>>;

  deleteNote(
    userId: string,
    noteId: string,
  ): Promise<TeswaResult<void, 'unknown'>>;

  deleteItem(
    userId: string,
    itemId: string,
  ): Promise<TeswaResult<void, 'unknown'>>;

  deleteMediaRow(
    userId: string,
    mediaId: string,
  ): Promise<TeswaResult<void, 'unknown'>>;

  getPublishSource(
    userId: string,
    dolabItemId: string,
  ): Promise<
    TeswaResult<
      { item: DolabItem | null; media: DolabMedia[] },
      'unknown'
    >
  >;

  markItemPublished(
    userId: string,
    dolabItemId: string,
    publishedItemId: string,
  ): Promise<TeswaResult<DolabItem | null, 'unknown'>>;

  markNoteShared(
    userId: string,
    noteId: string,
    conversationId: string,
  ): Promise<TeswaResult<void, 'unknown'>>;

  attachMediaToItem(
    userId: string,
    mediaId: string,
    dolabItemId: string,
  ): Promise<TeswaResult<DolabLinkMediaResult, 'not_found' | 'unknown'>>;

  linkNoteToMedia(
    userId: string,
    noteId: string,
    mediaId: string,
  ): Promise<TeswaResult<void, 'unknown'>>;

  createMediaRow(
    userId: string,
    input: DolabMediaWriteInput,
  ): Promise<TeswaResult<DolabMedia, 'unknown'>>;
}
