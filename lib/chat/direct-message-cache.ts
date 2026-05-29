import { createMMKV } from 'react-native-mmkv';

const DIRECT_MESSAGE_CACHE_STORAGE_ID = 'teswa-direct-message-cache';
const DIRECT_MESSAGE_CACHE_KEY_PREFIX = 'direct-chat:stream:v1:';
const DIRECT_MESSAGE_CACHE_INDEX_KEY = 'direct-chat:stream:v1:index';
const DIRECT_MESSAGE_CACHE_MAX_MESSAGES = 50;
const DIRECT_MESSAGE_CACHE_MAX_CONVERSATIONS = 50;
const DIRECT_MESSAGE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type TeswaMmkvStorage = ReturnType<typeof createMMKV>;

export type CachedDirectMessageAttachment = {
  type?: string;
  title?: string;
  name?: string;
  assetUrl?: string;
  imageUrl?: string;
  thumbUrl?: string;
  mimeType?: string;
  fileSize?: number;
  durationSeconds?: number;
};

export type CachedDirectMessage = {
  id: string;
  createdAt: string;
  text: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  reactionCounts?: Record<string, number>;
  ownReactions?: string[];
  quotedMessage?: { id: string; text: string; userName?: string };
  attachments?: CachedDirectMessageAttachment[];
  teswaType?: string;
  offerNote?: string;
  teswaConversationId?: string;
  teswaItemId?: string;
  teswaDolabItemId?: string;
};

export type DirectMessageCacheSnapshot = {
  conversationId: string;
  updatedAtMs: number;
  messages: CachedDirectMessage[];
};

type DirectMessageCacheIndexEntry = {
  conversationId: string;
  updatedAtMs: number;
};

let storage: TeswaMmkvStorage | null = null;
let storageInitAttempted = false;

function getStorage(): TeswaMmkvStorage | null {
  if (storageInitAttempted) return storage;
  storageInitAttempted = true;

  try {
    storage = createMMKV({ id: DIRECT_MESSAGE_CACHE_STORAGE_ID });
    return storage;
  } catch {
    storage = null;
    return null;
  }
}

function cacheKey(conversationId: string): string {
  return `${DIRECT_MESSAGE_CACHE_KEY_PREFIX}${conversationId}`;
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeReactionCounts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, count]) => [key, safeNumber(count)] as const)
    .filter((entry): entry is readonly [string, number] => typeof entry[1] === 'number');

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeAttachments(value: unknown): CachedDirectMessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const attachments = value.map((attachment): CachedDirectMessageAttachment => ({
    type: safeString(attachment?.type),
    title: safeString(attachment?.title),
    name: safeString(attachment?.name),
    assetUrl: safeString(attachment?.assetUrl),
    imageUrl: safeString(attachment?.imageUrl),
    thumbUrl: safeString(attachment?.thumbUrl),
    mimeType: safeString(attachment?.mimeType),
    fileSize: safeNumber(attachment?.fileSize),
    durationSeconds: safeNumber(attachment?.durationSeconds),
  })).filter((attachment) => Object.values(attachment).some((field) => field !== undefined));

  return attachments.length > 0 ? attachments : undefined;
}

export function sanitizeDirectMessagesForCache(messages: CachedDirectMessage[]): CachedDirectMessage[] {
  return messages
    .map((message): CachedDirectMessage | null => {
      const id = safeString(message?.id);
      const createdAt = safeString(message?.createdAt);
      if (!id || !createdAt) return null;

      const ownReactions = Array.isArray(message.ownReactions)
        ? message.ownReactions.filter((reaction): reaction is string => typeof reaction === 'string' && reaction.length > 0)
        : undefined;

      return {
        id,
        createdAt,
        text: typeof message.text === 'string' ? message.text : '',
        userId: safeString(message.userId) ?? '',
        userName: safeString(message.userName),
        userAvatar: safeString(message.userAvatar),
        reactionCounts: sanitizeReactionCounts(message.reactionCounts),
        ownReactions: ownReactions && ownReactions.length > 0 ? ownReactions : undefined,
        quotedMessage: message.quotedMessage?.id ? {
          id: message.quotedMessage.id,
          text: typeof message.quotedMessage.text === 'string' ? message.quotedMessage.text : '',
          userName: safeString(message.quotedMessage.userName),
        } : undefined,
        attachments: sanitizeAttachments(message.attachments),
        teswaType: safeString(message.teswaType),
        offerNote: safeString(message.offerNote),
        teswaConversationId: safeString(message.teswaConversationId),
        teswaItemId: safeString(message.teswaItemId),
        teswaDolabItemId: safeString(message.teswaDolabItemId),
      };
    })
    .filter((message): message is CachedDirectMessage => message !== null)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .slice(-DIRECT_MESSAGE_CACHE_MAX_MESSAGES);
}

function readIndex(mmkv: TeswaMmkvStorage): DirectMessageCacheIndexEntry[] {
  try {
    const raw = mmkv.getString(DIRECT_MESSAGE_CACHE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): DirectMessageCacheIndexEntry | null => {
        const conversationId = safeString(entry?.conversationId);
        const updatedAtMs = safeNumber(entry?.updatedAtMs);
        return conversationId && updatedAtMs ? { conversationId, updatedAtMs } : null;
      })
      .filter((entry): entry is DirectMessageCacheIndexEntry => entry !== null);
  } catch {
    return [];
  }
}

function writeIndex(mmkv: TeswaMmkvStorage, entries: DirectMessageCacheIndexEntry[]): void {
  mmkv.set(DIRECT_MESSAGE_CACHE_INDEX_KEY, JSON.stringify(entries));
}

export function readDirectMessageCache(conversationIdInput: string): DirectMessageCacheSnapshot | null {
  const conversationId = conversationIdInput.trim();
  const mmkv = getStorage();
  if (!conversationId || !mmkv) return null;

  try {
    const raw = mmkv.getString(cacheKey(conversationId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const updatedAtMs = safeNumber(parsed?.updatedAtMs);
    const messages = sanitizeDirectMessagesForCache(Array.isArray(parsed?.messages) ? parsed.messages : []);
    if (!updatedAtMs || messages.length === 0) return null;

    if (updatedAtMs + DIRECT_MESSAGE_CACHE_TTL_MS <= Date.now()) {
      mmkv.remove(cacheKey(conversationId));
      return null;
    }

    return { conversationId, updatedAtMs, messages };
  } catch {
    return null;
  }
}

export function writeDirectMessageCache(conversationIdInput: string, messagesInput: CachedDirectMessage[]): void {
  const conversationId = conversationIdInput.trim();
  const mmkv = getStorage();
  if (!conversationId || !mmkv) return;

  const messages = sanitizeDirectMessagesForCache(messagesInput);
  const updatedAtMs = Date.now();

  try {
    if (messages.length === 0) {
      mmkv.remove(cacheKey(conversationId));
    } else {
      const snapshot: DirectMessageCacheSnapshot = { conversationId, updatedAtMs, messages };
      mmkv.set(cacheKey(conversationId), JSON.stringify(snapshot));
    }

    const existing = readIndex(mmkv).filter((entry) => entry.conversationId !== conversationId);
    const next = messages.length === 0 ? existing : [{ conversationId, updatedAtMs }, ...existing];
    writeIndex(mmkv, next.slice(0, DIRECT_MESSAGE_CACHE_MAX_CONVERSATIONS));
    pruneDirectMessageCache();
  } catch {}
}

export function pruneDirectMessageCache(nowMs = Date.now()): void {
  const mmkv = getStorage();
  if (!mmkv) return;

  try {
    const sorted = readIndex(mmkv).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    const kept: DirectMessageCacheIndexEntry[] = [];
    const seen = new Set<string>();

    sorted.forEach((entry) => {
      if (seen.has(entry.conversationId)) return;
      seen.add(entry.conversationId);
      const expired = entry.updatedAtMs + DIRECT_MESSAGE_CACHE_TTL_MS <= nowMs;
      const overLimit = kept.length >= DIRECT_MESSAGE_CACHE_MAX_CONVERSATIONS;
      if (expired || overLimit) {
        mmkv.remove(cacheKey(entry.conversationId));
      } else {
        kept.push(entry);
      }
    });

    writeIndex(mmkv, kept);
  } catch {}
}

export const directMessageCacheConfig = {
  storageId: DIRECT_MESSAGE_CACHE_STORAGE_ID,
  keyPrefix: DIRECT_MESSAGE_CACHE_KEY_PREFIX,
  maxMessages: DIRECT_MESSAGE_CACHE_MAX_MESSAGES,
  maxConversations: DIRECT_MESSAGE_CACHE_MAX_CONVERSATIONS,
  ttlMs: DIRECT_MESSAGE_CACHE_TTL_MS,
} as const;
