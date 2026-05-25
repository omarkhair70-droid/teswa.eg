import { getString, setString } from '@/lib/storage/mmkv-storage';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';

const DOLAB_PENDING_MEDIA_KEY = 'teswa.dolab.pendingMedia.v1';
const DOLAB_LOCAL_SELF_MESSAGES_KEY = 'teswa.dolab.localSelfMessages.v1';

function parseArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isDolabPendingMedia(value: unknown): value is DolabPendingMedia {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabPendingMedia>;
  return typeof candidate.id === 'string' && typeof candidate.uri === 'string' && typeof candidate.mediaType === 'string' && typeof candidate.createdAt === 'string';
}

function isDolabSelfMessage(value: unknown): value is DolabSelfMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabSelfMessage>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.body === 'string' &&
    typeof candidate.messageType === 'string' &&
    Array.isArray(candidate.linkedPendingMediaIds) &&
    typeof candidate.createdAt === 'string'
  );
}

export async function readLocalDolabPendingMedia(): Promise<DolabPendingMedia[]> {
  const parsed = parseArray(getString(DOLAB_PENDING_MEDIA_KEY));
  return parsed.filter(isDolabPendingMedia);
}

export async function writeLocalDolabPendingMedia(items: DolabPendingMedia[]): Promise<void> {
  try {
    setString(DOLAB_PENDING_MEDIA_KEY, JSON.stringify(items));
  } catch {
    // no-op: persistence should never crash Dolab
  }
}

export async function readLocalDolabSelfMessages(): Promise<DolabSelfMessage[]> {
  const parsed = parseArray(getString(DOLAB_LOCAL_SELF_MESSAGES_KEY));
  return parsed.filter(isDolabSelfMessage);
}

export async function writeLocalDolabSelfMessages(items: DolabSelfMessage[]): Promise<void> {
  try {
    setString(DOLAB_LOCAL_SELF_MESSAGES_KEY, JSON.stringify(items));
  } catch {
    // no-op: persistence should never crash Dolab
  }
}
