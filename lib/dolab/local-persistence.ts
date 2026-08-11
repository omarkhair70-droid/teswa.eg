import { getString, setString } from '@/lib/storage/mmkv-storage';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';
import type { DolabDraftItem } from '@/lib/dolab/draft-types';
import type { DolabShareDraft } from '@/lib/dolab/share-bridge-types';
import type { DolabPublishDraft } from '@/lib/dolab/publish-bridge-types';
import type { DolabCollection, DolabCollectionAssignment } from '@/lib/dolab/collections';
import type { DolabInboxItem } from '@/lib/dolab/inbox';

const DOLAB_WORKSPACE_KEY = 'teswa.dolab.workspace.v2';
const DOLAB_PENDING_MEDIA_KEY = 'teswa.dolab.pendingMedia.v1';
const DOLAB_LOCAL_SELF_MESSAGES_KEY = 'teswa.dolab.localSelfMessages.v1';

export type DolabLocalWorkspaceSnapshot = {
  version: 2;
  pendingMedia: DolabPendingMedia[];
  localDrafts: DolabDraftItem[];
  selfMessages: DolabSelfMessage[];
  shareDrafts: DolabShareDraft[];
  publishDrafts: DolabPublishDraft[];
  collections: DolabCollection[];
  collectionAssignments: DolabCollectionAssignment[];
  inboxItems: DolabInboxItem[];
  savedAt: string;
};

const EMPTY_WORKSPACE: DolabLocalWorkspaceSnapshot = {
  version: 2,
  pendingMedia: [],
  localDrafts: [],
  selfMessages: [],
  shareDrafts: [],
  publishDrafts: [],
  collections: [],
  collectionAssignments: [],
  inboxItems: [],
  savedAt: '',
};

function parseArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
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

function isDolabDraftItem(value: unknown): value is DolabDraftItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabDraftItem>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.linkedPendingMediaIds) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isDolabShareDraft(value: unknown): value is DolabShareDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabShareDraft>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sourceMessageId === 'string' &&
    typeof candidate.body === 'string' &&
    Array.isArray(candidate.linkedPendingMediaIds) &&
    typeof candidate.targetMode === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function isDolabPublishDraft(value: unknown): value is DolabPublishDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabPublishDraft>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sourceDraftId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.linkedPendingMediaIds) &&
    Array.isArray(candidate.missingFields) &&
    typeof candidate.readinessStatus === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isDolabCollection(value: unknown): value is DolabCollection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabCollection>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string';
}

function isDolabCollectionAssignment(value: unknown): value is DolabCollectionAssignment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabCollectionAssignment>;
  return typeof candidate.collectionId === 'string' && typeof candidate.targetType === 'string' && typeof candidate.targetId === 'string' && typeof candidate.assignedAt === 'string';
}

function isDolabInboxItem(value: unknown): value is DolabInboxItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DolabInboxItem>;
  return typeof candidate.id === 'string' && typeof candidate.type === 'string' && typeof candidate.source === 'string' && typeof candidate.title === 'string' && typeof candidate.createdAt === 'string';
}

function safeArray<T>(value: unknown, guard: (candidate: unknown) => candidate is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

export function readLocalDolabWorkspaceSnapshot(): DolabLocalWorkspaceSnapshot {
  const parsed = parseObject(getString(DOLAB_WORKSPACE_KEY));
  if (parsed?.version === 2) {
    return {
      version: 2,
      pendingMedia: safeArray(parsed.pendingMedia, isDolabPendingMedia),
      localDrafts: safeArray(parsed.localDrafts, isDolabDraftItem),
      selfMessages: safeArray(parsed.selfMessages, isDolabSelfMessage),
      shareDrafts: safeArray(parsed.shareDrafts, isDolabShareDraft),
      publishDrafts: safeArray(parsed.publishDrafts, isDolabPublishDraft),
      collections: safeArray(parsed.collections, isDolabCollection),
      collectionAssignments: safeArray(parsed.collectionAssignments, isDolabCollectionAssignment),
      inboxItems: safeArray(parsed.inboxItems, isDolabInboxItem),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  }

  // One-time compatibility path for users who already have the v1 local media/self-chat keys.
  return {
    ...EMPTY_WORKSPACE,
    pendingMedia: parseArray(getString(DOLAB_PENDING_MEDIA_KEY)).filter(isDolabPendingMedia),
    selfMessages: parseArray(getString(DOLAB_LOCAL_SELF_MESSAGES_KEY)).filter(isDolabSelfMessage),
  };
}

export function writeLocalDolabWorkspaceSnapshot(input: Omit<DolabLocalWorkspaceSnapshot, 'version' | 'savedAt'>): boolean {
  try {
    const snapshot: DolabLocalWorkspaceSnapshot = {
      version: 2,
      ...input,
      savedAt: new Date().toISOString(),
    };
    setString(DOLAB_WORKSPACE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export async function readLocalDolabPendingMedia(): Promise<DolabPendingMedia[]> {
  const workspace = readLocalDolabWorkspaceSnapshot();
  return workspace.pendingMedia;
}

export async function writeLocalDolabPendingMedia(items: DolabPendingMedia[]): Promise<void> {
  try {
    setString(DOLAB_PENDING_MEDIA_KEY, JSON.stringify(items));
  } catch {
    // Kept for compatibility with older call sites. The v2 workspace writer reports success/failure.
  }
}

export async function readLocalDolabSelfMessages(): Promise<DolabSelfMessage[]> {
  const workspace = readLocalDolabWorkspaceSnapshot();
  return workspace.selfMessages;
}

export async function writeLocalDolabSelfMessages(items: DolabSelfMessage[]): Promise<void> {
  try {
    setString(DOLAB_LOCAL_SELF_MESSAGES_KEY, JSON.stringify(items));
  } catch {
    // Kept for compatibility with older call sites. The v2 workspace writer reports success/failure.
  }
}
