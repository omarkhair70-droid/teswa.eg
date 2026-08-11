import { fetchDirectConversation } from '@/lib/direct-messages';
import {
  createNativeDirectAttachmentSignedUrl,
  deleteNativeDirectMessage,
  fetchNativeDirectMessages,
  fetchNativeDirectTypingUsers,
  markNativeDirectConversationRead,
  removeNativeDirectUploads,
  sendNativeDirectMessage,
  setNativeDirectTypingState,
  subscribeToNativeDirectConversation,
  toggleNativeDirectReaction,
  uploadNativeDirectAttachment,
  type NativeDirectAttachment,
  type NativeDirectMessage,
} from '@/lib/chat/supabase-direct-chat';
import { supabase } from '@/lib/supabase/client';

const CHANNEL_PREFIX = 'teswa-direct-';
const UPLOAD_MARKER_PREFIX = 'teswa-native-upload://';

type Listener = (event?: any) => void;
type PendingUpload = NativeDirectAttachment & { localMarker: string };

type CompatAttachment = {
  type?: string;
  title?: string;
  name?: string;
  asset_url?: string;
  image_url?: string;
  thumb_url?: string;
  mime_type?: string;
  file_size?: number;
  duration?: number;
  duration_seconds?: number;
};

type CompatMessage = {
  id: string;
  text: string;
  created_at: string;
  updated_at: string;
  user: { id: string; name?: string; image?: string };
  reaction_counts?: Record<string, number>;
  own_reactions?: Array<{ type: string }>;
  attachments?: CompatAttachment[];
  quoted_message?: { id: string; text: string; user?: { id: string; name?: string } };
  [key: string]: unknown;
};

function conversationIdFromChannelId(channelId: string) {
  const trimmed = channelId.trim();
  if (!trimmed.startsWith(CHANNEL_PREFIX)) throw new Error('Invalid Direct Chat channel id.');
  const value = trimmed.slice(CHANNEL_PREFIX.length).trim();
  if (!value) throw new Error('Missing Direct Chat conversation id.');
  return value;
}

function buildReactionCounts(message: NativeDirectMessage) {
  const counts: Record<string, number> = {};
  message.reactions.forEach((reaction) => {
    counts[reaction.reaction] = (counts[reaction.reaction] ?? 0) + 1;
  });
  return counts;
}

function extractCustomMetadata(payload: Record<string, unknown>) {
  const metadata: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key.startsWith('teswa_')) metadata[key] = value;
  });
  const text = typeof payload.text === 'string' ? payload.text : '';
  metadata.native_client_text = text;
  return metadata;
}

function isUploadMarker(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(UPLOAD_MARKER_PREFIX);
}

export class NativeDirectCompatChannel {
  readonly type = 'messaging';
  readonly id: string;
  readonly conversationId: string;
  readonly currentUserId: string;
  readonly memberIds: string[];
  state: { messages: CompatMessage[]; read: Record<string, { user: { id: string }; last_read: string }> } = {
    messages: [],
    read: {},
  };

  private listeners = new Map<string, Set<Listener>>();
  private stopRealtime: (() => void) | null = null;
  private pendingUploads = new Map<string, PendingUpload>();
  private typingUsers = new Set<string>();
  private typingStopTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private otherUserId = '';
  private otherDisplayName = '';
  private otherAvatarUrl = '';
  private currentDisplayName = '';
  private currentAvatarUrl = '';

  constructor(input: { channelId: string; currentUserId: string; members?: string[] }) {
    this.id = input.channelId;
    this.conversationId = conversationIdFromChannelId(input.channelId);
    this.currentUserId = input.currentUserId;
    this.memberIds = Array.from(new Set((input.members ?? []).filter(Boolean)));
  }

  private emit(event: string, payload?: any) {
    this.listeners.get(event)?.forEach((listener) => {
      try { listener(payload); } catch {}
    });
  }

  private async resolveIdentity() {
    const [conversation, auth] = await Promise.all([
      fetchDirectConversation(this.conversationId),
      supabase.auth.getUser(),
    ]);
    if (!conversation) throw new Error('Direct Chat conversation not found.');
    if (conversation.status !== 'accepted') throw new Error('Direct Chat conversation is not accepted.');

    this.otherUserId = conversation.otherUserId;
    this.otherDisplayName = conversation.otherDisplayName ?? conversation.otherUsername ?? 'مستخدم تِسوى';
    this.otherAvatarUrl = conversation.otherAvatarUrl ?? '';

    const metadata = (auth.data.user?.user_metadata ?? {}) as Record<string, unknown>;
    this.currentDisplayName =
      (typeof metadata.display_name === 'string' && metadata.display_name.trim()) ||
      (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
      'أنت';
    this.currentAvatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : '';
  }

  private async mapAttachment(attachment: NativeDirectAttachment): Promise<CompatAttachment> {
    const signedUrl = await createNativeDirectAttachmentSignedUrl(
      attachment.storagePath,
      60 * 60,
      attachment.storageBucket,
    );
    const title = attachment.fileName ?? undefined;
    const common = {
      title,
      name: title,
      mime_type: attachment.mimeType ?? undefined,
      file_size: attachment.sizeBytes ?? undefined,
    };

    if (attachment.kind === 'image') {
      return { type: 'image', image_url: signedUrl ?? undefined, ...common };
    }
    if (attachment.kind === 'video') {
      return { type: 'video', asset_url: signedUrl ?? undefined, ...common };
    }
    if (attachment.kind === 'audio') {
      const seconds = typeof attachment.durationMs === 'number' ? Math.max(0, attachment.durationMs / 1000) : undefined;
      return { type: 'audio', asset_url: signedUrl ?? undefined, duration: seconds, duration_seconds: seconds, ...common };
    }
    return { type: 'file', asset_url: signedUrl ?? undefined, ...common };
  }

  private async mapMessage(message: NativeDirectMessage, byId: Map<string, NativeDirectMessage>): Promise<CompatMessage> {
    const metadata = message.metadata ?? {};
    const customText = typeof metadata.native_client_text === 'string' ? metadata.native_client_text : null;
    const hasAttachments = message.attachments.length > 0;
    const text = customText !== null
      ? customText
      : hasAttachments && ['صورة', 'فيديو', 'ملف', 'رسالة صوتية'].includes(message.body)
        ? ''
        : message.body;

    const userIsMe = message.senderId === this.currentUserId;
    const reactionCounts = buildReactionCounts(message);
    const ownReactions = message.reactions
      .filter((reaction) => reaction.userId === this.currentUserId)
      .map((reaction) => ({ type: reaction.reaction }));
    const quoted = message.replyToMessageId ? byId.get(message.replyToMessageId) : null;
    const attachments = await Promise.all(message.attachments.map((attachment) => this.mapAttachment(attachment)));

    const mapped: CompatMessage = {
      id: message.id,
      text,
      created_at: message.createdAt,
      updated_at: message.createdAt,
      user: {
        id: message.senderId,
        name: userIsMe ? this.currentDisplayName : this.otherDisplayName,
        image: userIsMe ? this.currentAvatarUrl : this.otherAvatarUrl,
      },
      reaction_counts: Object.keys(reactionCounts).length ? reactionCounts : undefined,
      own_reactions: ownReactions.length ? ownReactions : undefined,
      attachments: attachments.length ? attachments : undefined,
      quoted_message: message.replyToMessageId
        ? {
            id: message.replyToMessageId,
            text: message.replyBody ?? quoted?.body ?? '',
            user: {
              id: message.replySenderId ?? quoted?.senderId ?? '',
              name: (message.replySenderId ?? quoted?.senderId) === this.currentUserId ? this.currentDisplayName : this.otherDisplayName,
            },
          }
        : undefined,
    };

    Object.entries(metadata).forEach(([key, value]) => {
      if (key.startsWith('teswa_')) mapped[key] = value;
    });
    return mapped;
  }

  private updateReadState(messages: NativeDirectMessage[]) {
    const readTimes = messages
      .filter((message) => message.senderId === this.currentUserId && message.readAt)
      .map((message) => message.readAt as string)
      .sort();
    const latest = readTimes.at(-1);
    this.state.read = latest && this.otherUserId
      ? { [this.otherUserId]: { user: { id: this.otherUserId }, last_read: latest } }
      : {};
  }

  private async refreshMessages() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      await this.resolveIdentity();
      const result = await fetchNativeDirectMessages(this.conversationId, { limit: 200 });
      if (!result.ok) throw new Error(result.message);
      const nativeMessages = result.messages as NativeDirectMessage[];
      const byId = new Map<string, NativeDirectMessage>(nativeMessages.map((message: NativeDirectMessage) => [message.id, message]));
      this.state.messages = await Promise.all(nativeMessages.map((message: NativeDirectMessage) => this.mapMessage(message, byId)));
      this.updateReadState(nativeMessages);
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshAndEmit(event = 'message.updated') {
    await this.refreshMessages();
    this.emit(event, { type: event });
  }

  private async refreshTyping() {
    const users = new Set((await fetchNativeDirectTypingUsers(this.conversationId)).filter((id) => id !== this.currentUserId));
    for (const id of users) {
      if (!this.typingUsers.has(id)) {
        this.emit('typing.start', { user: { id, name: id === this.otherUserId ? this.otherDisplayName : undefined } });
      }
    }
    for (const id of this.typingUsers) {
      if (!users.has(id)) this.emit('typing.stop', { user: { id, name: id === this.otherUserId ? this.otherDisplayName : undefined } });
    }
    this.typingUsers = users;
  }

  async watch() {
    await this.refreshMessages();
    if (!this.stopRealtime) {
      this.stopRealtime = subscribeToNativeDirectConversation(this.conversationId, {
        onMessagesChanged: () => { void this.refreshAndEmit('message.updated'); },
        onAttachmentsChanged: () => { void this.refreshAndEmit('message.updated'); },
        onReactionsChanged: () => { void this.refreshAndEmit('message.updated'); },
        onTypingChanged: () => { void this.refreshTyping(); },
      });
    }
    await this.refreshTyping();
    return { messages: this.state.messages };
  }

  async query() {
    await this.refreshMessages();
    return { messages: this.state.messages };
  }

  async markRead() {
    await markNativeDirectConversationRead(this.conversationId);
    await this.refreshMessages();
    return { ok: true };
  }

  on(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return {
      unsubscribe: () => {
        const current = this.listeners.get(event);
        current?.delete(listener);
        if (current?.size === 0) this.listeners.delete(event);
      },
    };
  }

  private makeUploadMarker() {
    return `${UPLOAD_MARKER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private async upload(input: { uri: string; kind: 'image' | 'video' | 'file' | 'audio'; fileName?: string; mimeType?: string }) {
    const marker = this.makeUploadMarker();
    const result = await uploadNativeDirectAttachment({
      conversationId: this.conversationId,
      currentUserId: this.currentUserId,
      localUri: input.uri,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    if (!result.ok) throw new Error(result.message);
    this.pendingUploads.set(marker, { ...result.attachment, localMarker: marker });
    return { file: marker };
  }

  async sendImage(uri: string) {
    return this.upload({ uri, kind: 'image' });
  }

  async sendFile(uri: string, fileName?: string, mimeType?: string) {
    const normalizedMime = mimeType?.toLowerCase() ?? '';
    const kind = normalizedMime.startsWith('video/') ? 'video' : normalizedMime.startsWith('audio/') ? 'audio' : 'file';
    return this.upload({ uri, kind, fileName, mimeType });
  }

  private consumePayloadAttachments(payload: any) {
    const source = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const consumedMarkers: string[] = [];
    const attachments: NativeDirectAttachment[] = [];

    source.forEach((attachment: any) => {
      const marker = [attachment?.image_url, attachment?.asset_url].find(isUploadMarker);
      if (!marker) return;
      const pending = this.pendingUploads.get(marker);
      if (!pending) return;
      consumedMarkers.push(marker);
      attachments.push({
        ...pending,
        kind: attachment?.type === 'image' ? 'image' : attachment?.type === 'video' ? 'video' : attachment?.type === 'audio' ? 'audio' : pending.kind,
        fileName: attachment?.name ?? attachment?.title ?? pending.fileName ?? null,
        mimeType: attachment?.mime_type ?? pending.mimeType ?? null,
        sizeBytes: typeof attachment?.file_size === 'number' ? attachment.file_size : pending.sizeBytes ?? null,
        durationMs: typeof attachment?.duration === 'number'
          ? Math.round(attachment.duration * 1000)
          : typeof attachment?.duration_seconds === 'number'
            ? Math.round(attachment.duration_seconds * 1000)
            : pending.durationMs ?? null,
      });
    });
    return { attachments, consumedMarkers };
  }

  async sendMessage(payload: Record<string, unknown>) {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const { attachments, consumedMarkers } = this.consumePayloadAttachments(payload);
    const result = await sendNativeDirectMessage({
      conversationId: this.conversationId,
      body: text,
      replyToMessageId: typeof payload.quoted_message_id === 'string' ? payload.quoted_message_id : null,
      attachments,
      metadata: extractCustomMetadata(payload),
    });
    if (!result.ok) {
      const paths = attachments.map((attachment) => attachment.storagePath);
      if (paths.length) await removeNativeDirectUploads(paths);
      consumedMarkers.forEach((marker) => this.pendingUploads.delete(marker));
      throw new Error(result.message);
    }
    consumedMarkers.forEach((marker) => this.pendingUploads.delete(marker));
    await this.refreshAndEmit('message.new');
    return { message: this.state.messages.find((message) => message.id === result.messageId) ?? null };
  }

  async sendReaction(messageId: string, reaction: { type?: string }) {
    if (reaction.type !== 'love' && reaction.type !== 'thumbs_up') throw new Error('Unsupported reaction.');
    const existing = this.state.messages.find((message) => message.id === messageId)?.own_reactions?.some((item) => item.type === reaction.type);
    if (!existing) {
      const result = await toggleNativeDirectReaction(messageId, reaction.type);
      if (!result.ok) throw new Error('Reaction failed.');
    }
    await this.refreshAndEmit('message.updated');
    return { ok: true };
  }

  async deleteMessage(messageId: string) {
    const result = await deleteNativeDirectMessage(messageId);
    if (!result.ok) throw new Error(result.message);
    await this.refreshAndEmit('message.deleted');
    return { ok: true };
  }

  async keystroke() {
    await setNativeDirectTypingState(this.conversationId, true);
    if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
    this.typingStopTimer = setTimeout(() => {
      void setNativeDirectTypingState(this.conversationId, false);
      this.typingStopTimer = null;
    }, 5500);
  }

  async stopTyping() {
    if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
    this.typingStopTimer = null;
    await setNativeDirectTypingState(this.conversationId, false);
  }

  countUnread() {
    return 0;
  }

  dispose() {
    this.stopRealtime?.();
    this.stopRealtime = null;
    this.listeners.clear();
    if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
    this.typingStopTimer = null;
    void setNativeDirectTypingState(this.conversationId, false);
  }
}

export class NativeDirectCompatClient {
  readonly userID: string;
  private channels = new Map<string, NativeDirectCompatChannel>();

  constructor(userId: string) {
    this.userID = userId;
  }

  channel(_type: string, id: string, extraData?: { members?: string[] }) {
    const existing = this.channels.get(id);
    if (existing) return existing;
    const channel = new NativeDirectCompatChannel({ channelId: id, currentUserId: this.userID, members: extraData?.members });
    this.channels.set(id, channel);
    return channel;
  }

  async connectUser() {
    return { me: { id: this.userID } };
  }

  async disconnectUser() {
    this.channels.forEach((channel) => channel.dispose());
    this.channels.clear();
  }
}
