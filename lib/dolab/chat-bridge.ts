import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';
import { readLocalDolabPendingMedia, readLocalDolabSelfMessages, writeLocalDolabPendingMedia, writeLocalDolabSelfMessages } from '@/lib/dolab/local-persistence';

type BridgeAttachment = {
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

type ShareableItem = {
  id: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'file';
  title: string;
  body?: string;
  uri?: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function mapAttachmentToPendingMedia(attachment: BridgeAttachment): DolabPendingMedia | null {
  const uri = attachment.imageUrl || attachment.assetUrl || attachment.thumbUrl;
  if (!uri) return null;
  const kind = (attachment.type || '').toLowerCase();
  const mime = attachment.mimeType?.toLowerCase();
  const mediaType = kind === 'image' || mime?.startsWith('image/')
    ? 'image'
    : kind === 'video' || mime?.startsWith('video/')
      ? 'video'
      : kind === 'audio' || mime?.startsWith('audio/')
        ? 'audio'
        : null;
  if (!mediaType) return null;
  return {
    id: uid('direct-chat-media'),
    uri,
    mediaType,
    fileName: attachment.name || attachment.title,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.fileSize,
    durationMs: typeof attachment.durationSeconds === 'number' ? Math.round(attachment.durationSeconds * 1000) : undefined,
    createdAt: new Date().toISOString(),
    uploadStatus: 'local',
    compressionStatus: mediaType === 'audio' ? 'not_needed' : 'pending',
    originalUri: uri,
    originalSizeBytes: attachment.fileSize,
  };
}

export async function saveDirectMessageToDolab(input: {
  conversationId: string;
  messageId: string;
  text?: string;
  attachments?: BridgeAttachment[];
}): Promise<{ ok: true; savedText?: boolean; savedMediaCount?: number } | { ok: false; message: string }> {
  try {
    const text = input.text?.trim();
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    if (!text && attachments.length === 0) return { ok: false, message: 'مفيش حاجة تتحفظ من الرسالة دي.' };

    let savedText = false;
    let savedMediaCount = 0;
    if (text) {
      const prevMessages = await readLocalDolabSelfMessages();
      const nextMessage: DolabSelfMessage = {
        id: uid('direct-chat-note'),
        body: `${text}\n\n— المصدر: direct-chat • ${input.conversationId} • ${input.messageId}`,
        messageType: 'text',
        linkedPendingMediaIds: [],
        createdAt: new Date().toISOString(),
      };
      await writeLocalDolabSelfMessages([nextMessage, ...prevMessages]);
      savedText = true;
    }

    const mapped = attachments.map(mapAttachmentToPendingMedia).filter((item): item is DolabPendingMedia => !!item);
    const hasUnsupportedAttachments = attachments.length > mapped.length;
    if (mapped.length > 0) {
      const prevMedia = await readLocalDolabPendingMedia();
      await writeLocalDolabPendingMedia([...mapped, ...prevMedia]);
      savedMediaCount = mapped.length;
    }

    if (!savedText && savedMediaCount === 0 && hasUnsupportedAttachments) {
      return { ok: false, message: 'نوع الملف ده لسه مش جاهز للحفظ في الدولاب.' };
    }

    return { ok: true, savedText, savedMediaCount };
  } catch {
    return { ok: false, message: 'تعذر الحفظ في الدولاب حالياً.' };
  }
}

export async function loadRecentDolabShareables(): Promise<{ ok: true; items: ShareableItem[] } | { ok: false; message: string }> {
  try {
    const [media, messages] = await Promise.all([readLocalDolabPendingMedia(), readLocalDolabSelfMessages()]);
    const textItems: ShareableItem[] = messages.slice(0, 6).map((msg) => ({ id: `text-${msg.id}`, kind: 'text', title: 'ملاحظة من الدولاب', body: msg.body }));
    const mediaItems: ShareableItem[] = media.slice(0, 8).map((item) => ({
      id: `media-${item.id}`,
      kind: item.mediaType,
      title: item.fileName || (item.mediaType === 'image' ? 'صورة من الدولاب' : item.mediaType === 'video' ? 'فيديو من الدولاب' : 'صوت من الدولاب'),
      uri: item.uri,
      mimeType: item.mimeType,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
    }));
    return { ok: true, items: [...textItems, ...mediaItems].slice(0, 10) };
  } catch {
    return { ok: false, message: 'تعذر تحميل عناصر الدولاب حالياً.' };
  }
}

export async function saveComposerDraftToDolab(input: { text?: string; attachment?: { kind: 'image' | 'video' | 'file'; uri: string; fileName?: string; mimeType?: string; sizeBytes?: number } | null }): Promise<{ ok: true; savedText?: boolean; savedMedia?: boolean } | { ok: false; message: string }> {
  try {
    const text = input.text?.trim();
    const attachment = input.attachment;
    let savedText = false;
    let savedMedia = false;
    if (!text && !attachment) return { ok: false, message: 'اكتب حاجة أو اختار ميديا الأول.' };
    if (text) {
      const prev = await readLocalDolabSelfMessages();
      await writeLocalDolabSelfMessages([{ id: uid('composer-draft'), body: text, messageType: 'text', linkedPendingMediaIds: [], createdAt: new Date().toISOString() }, ...prev]);
      savedText = true;
    }
    if (attachment?.kind === 'file') {
      if (!savedText) return { ok: false, message: 'حفظ الملفات في الدولاب جاي قريبًا.' };
      return { ok: true, savedText, savedMedia: false };
    }
    if (attachment) {
      const prev = await readLocalDolabPendingMedia();
      await writeLocalDolabPendingMedia([{ id: uid('composer-media'), uri: attachment.uri, mediaType: attachment.kind, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, createdAt: new Date().toISOString(), uploadStatus: 'local', compressionStatus: attachment.kind === 'video' || attachment.kind === 'image' ? 'pending' : 'not_needed', originalUri: attachment.uri, originalSizeBytes: attachment.sizeBytes }, ...prev]);
      savedMedia = true;
    }
    return { ok: true, savedText, savedMedia };
  } catch {
    return { ok: false, message: 'تعذر الحفظ في الدولاب حالياً.' };
  }
}
