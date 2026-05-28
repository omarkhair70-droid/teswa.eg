import { createDolabMediaSignedUrls, fetchDolabLibrarySnapshot, saveDolabDraftItem, saveDolabSelfNote, uploadAndSaveDolabMedia } from '@/lib/dolab';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';
import { readLocalDolabPendingMedia, readLocalDolabSelfMessages, writeLocalDolabPendingMedia, writeLocalDolabSelfMessages } from '@/lib/dolab/local-persistence';
import { supabase } from '@/lib/supabase/client';

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

type ComposerAttachment = { kind: 'image' | 'video' | 'file'; uri: string; fileName?: string; mimeType?: string; sizeBytes?: number };

type DolabSaveResult = { ok: true; savedText?: boolean; savedMedia?: boolean; savedMediaCount?: number; alreadySaved?: boolean } | { ok: false; message: string };

type SupportedDolabFileKind = 'image' | 'video' | 'audio';

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

const UNSUPPORTED_MESSAGE = 'نوع الملف ده لسه مش مدعوم في الدولاب.';
const FAILURE_MESSAGE = 'تعذر الحفظ في الدولاب حالياً.';

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function isRemoteUri(uri?: string | null): boolean {
  return /^https?:\/\//i.test((uri ?? '').trim());
}

function inferSupportedFileKind(input: { type?: string; kind?: string; mimeType?: string; uri?: string; name?: string; title?: string }): SupportedDolabFileKind | null {
  const declared = (input.kind || input.type || '').toLowerCase();
  const mime = input.mimeType?.toLowerCase() ?? '';
  const name = `${input.name ?? ''} ${input.title ?? ''} ${input.uri ?? ''}`.toLowerCase();

  if (declared === 'image' || mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i.test(name)) return 'image';
  if (declared === 'video' || mime.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(name)) return 'video';
  if (declared === 'audio' || mime.startsWith('audio/') || /\.(m4a|mp3|aac|wav|ogg)(\?|#|$)/i.test(name)) return 'audio';
  return null;
}

function buildPendingMedia(input: { uri: string; mediaType: SupportedDolabFileKind; fileName?: string; mimeType?: string; sizeBytes?: number; durationSeconds?: number; idPrefix: string }): DolabPendingMedia {
  return {
    id: uid(input.idPrefix),
    uri: input.uri,
    mediaType: input.mediaType,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationMs: typeof input.durationSeconds === 'number' ? Math.round(input.durationSeconds * 1000) : undefined,
    createdAt: new Date().toISOString(),
    uploadStatus: 'local',
    compressionStatus: input.mediaType === 'audio' ? 'not_needed' : 'pending',
    originalUri: input.uri,
    originalSizeBytes: input.sizeBytes,
  };
}

function mapAttachmentToPendingMedia(attachment: BridgeAttachment): DolabPendingMedia | null {
  const uri = attachment.imageUrl || attachment.assetUrl || attachment.thumbUrl;
  if (!uri) return null;
  const mediaType = inferSupportedFileKind({ type: attachment.type, mimeType: attachment.mimeType, uri, name: attachment.name, title: attachment.title });
  if (!mediaType) return null;
  return buildPendingMedia({
    idPrefix: 'direct-chat-media',
    uri,
    mediaType,
    fileName: attachment.name || attachment.title,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.fileSize,
    durationSeconds: attachment.durationSeconds,
  });
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function buildFileNoteBody(input: { title?: string; uri?: string; mimeType?: string; sizeBytes?: number; storagePath?: string; source?: string }): string {
  const lines = ['ملف محفوظ في الدولاب'];
  if (input.title?.trim()) lines.push(`الاسم: ${input.title.trim()}`);
  if (input.mimeType?.trim()) lines.push(`النوع: ${input.mimeType.trim()}`);
  if (typeof input.sizeBytes === 'number') lines.push(`الحجم: ${input.sizeBytes} bytes`);
  if (input.storagePath?.trim()) lines.push(`مسار التخزين: ${input.storagePath.trim()}`);
  else if (input.uri?.trim() && isRemoteUri(input.uri)) lines.push(`الرابط: ${input.uri.trim()}`);
  if (input.source?.trim()) lines.push(`المصدر: ${input.source.trim()}`);
  return lines.join('\n');
}

async function saveTextNote(text: string, source?: string): Promise<'saved' | 'already' | 'failed'> {
  const body = source ? `${text}\n\n— المصدر: ${source}` : text;
  const prev = await readLocalDolabSelfMessages();
  if (prev.some((msg) => msg.body === body)) return 'already';

  const nextMessage: DolabSelfMessage = {
    id: uid('direct-chat-note'),
    body,
    messageType: 'text',
    linkedPendingMediaIds: [],
    createdAt: new Date().toISOString(),
  };
  await writeLocalDolabSelfMessages([nextMessage, ...prev]);

  const userId = await getUserId();
  if (userId) {
    const remote = await saveDolabSelfNote(userId, { body, messageType: 'text' });
    if (remote.error) return 'saved';
  }

  return 'saved';
}

async function saveMedia(media: DolabPendingMedia, options?: { allowLocalOnly?: boolean; noteBody?: string }): Promise<'saved' | 'already' | 'unsupported' | 'failed'> {
  const prevMedia = await readLocalDolabPendingMedia();
  if (prevMedia.some((item) => item.uri === media.uri && item.mimeType === media.mimeType && item.fileName === media.fileName)) return 'already';

  const userId = await getUserId();
  let remoteSaved = false;
  if (userId) {
    const title = media.fileName || (media.mediaType === 'image' ? 'صورة من الشات' : media.mediaType === 'video' ? 'فيديو من الشات' : 'صوت من الشات');
    const draftResult = await saveDolabDraftItem(userId, {
      title,
      description: options?.noteBody ?? buildFileNoteBody({ title, uri: media.uri, mimeType: media.mimeType, sizeBytes: media.sizeBytes }),
      category: undefined,
      condition: undefined,
      status: 'draft',
      source: 'note',
    });
    if (draftResult.data && !draftResult.error) {
      const uploadResult = await uploadAndSaveDolabMedia(userId, media, { dolabItemId: draftResult.data.id, sortOrder: 0 });
      if (uploadResult.data && !uploadResult.error) {
        media = { ...media, remoteMediaId: uploadResult.data.media.id, storagePath: uploadResult.data.storagePath, uploadStatus: 'uploaded' };
        remoteSaved = true;
      }
    }
  }

  if (!remoteSaved && !options?.allowLocalOnly && !isRemoteUri(media.uri)) return 'unsupported';

  await writeLocalDolabPendingMedia([media, ...prevMedia]);
  return 'saved';
}

async function saveRemoteFileMetadata(input: { uri: string; title?: string; mimeType?: string; sizeBytes?: number; source?: string }): Promise<'saved' | 'already' | 'unsupported' | 'failed'> {
  if (!isRemoteUri(input.uri)) return 'unsupported';
  const body = buildFileNoteBody(input);
  const prev = await readLocalDolabSelfMessages();
  if (prev.some((msg) => msg.body === body)) return 'already';
  await writeLocalDolabSelfMessages([{ id: uid('direct-chat-file'), body, messageType: 'text', linkedPendingMediaIds: [], createdAt: new Date().toISOString() }, ...prev]);

  const userId = await getUserId();
  if (userId) {
    const draft = await saveDolabDraftItem(userId, { title: input.title || 'ملف من الشات', description: body, category: undefined, condition: undefined, status: 'draft', source: 'note' });
    if (draft.error) return 'saved';
    await saveDolabSelfNote(userId, { body, messageType: 'text', dolabItemId: draft.data?.id ?? null });
  }
  return 'saved';
}

export async function saveDirectMessageToDolab(input: {
  conversationId: string;
  messageId: string;
  text?: string;
  attachments?: BridgeAttachment[];
}): Promise<DolabSaveResult> {
  try {
    const text = input.text?.trim();
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    if (!text && attachments.length === 0) return { ok: false, message: 'مفيش حاجة تتحفظ من الرسالة دي.' };

    let savedText = false;
    let savedMediaCount = 0;
    let alreadySaved = false;
    if (text) {
      const textResult = await saveTextNote(text, `direct-chat • ${input.conversationId} • ${input.messageId}`);
      savedText = textResult === 'saved';
      alreadySaved = alreadySaved || textResult === 'already';
    }

    let unsupported = false;
    for (const attachment of attachments) {
      const mapped = mapAttachmentToPendingMedia(attachment);
      if (mapped) {
        const result = await saveMedia(mapped, { allowLocalOnly: attachment.type !== 'file' || isRemoteUri(mapped.uri) });
        if (result === 'saved') savedMediaCount += 1;
        else if (result === 'already') alreadySaved = true;
        else if (result === 'unsupported') unsupported = true;
      } else if (attachment.assetUrl && isRemoteUri(attachment.assetUrl)) {
        const result = await saveRemoteFileMetadata({ uri: attachment.assetUrl, title: attachment.name || attachment.title, mimeType: attachment.mimeType, sizeBytes: attachment.fileSize, source: `direct-chat • ${input.conversationId} • ${input.messageId}` });
        if (result === 'saved') savedText = true;
        else if (result === 'already') alreadySaved = true;
        else unsupported = true;
      } else {
        unsupported = true;
      }
    }

    if (!savedText && savedMediaCount === 0) {
      if (alreadySaved) return { ok: true, alreadySaved: true };
      if (unsupported) return { ok: false, message: UNSUPPORTED_MESSAGE };
      return { ok: false, message: FAILURE_MESSAGE };
    }

    return { ok: true, savedText, savedMediaCount, alreadySaved };
  } catch {
    return { ok: false, message: FAILURE_MESSAGE };
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
    const localItems = [...textItems, ...mediaItems].slice(0, 10);
    if (localItems.length > 0) return { ok: true, items: localItems };

    const userId = await getUserId();
    if (!userId) return { ok: true, items: [] };
    const snapshot = await fetchDolabLibrarySnapshot(userId);
    if (snapshot.error) return { ok: false, message: 'تعذر تحميل عناصر الدولاب حالياً.' };

    const signedUrls = await createDolabMediaSignedUrls(snapshot.data.media.slice(0, 8));
    const remoteNotes: ShareableItem[] = snapshot.data.notes.slice(0, 6).map((note) => ({
      id: `remote-note-${note.id}`,
      kind: 'text',
      title: 'ملاحظة من الدولاب',
      body: note.body ?? '',
    }));
    const remoteMedia: ShareableItem[] = snapshot.data.media.slice(0, 8).map((item) => ({
      id: `remote-media-${item.id}`,
      kind: item.media_type,
      title: item.media_type === 'image' ? 'صورة من الدولاب' : item.media_type === 'video' ? 'فيديو من الدولاب' : 'صوت من الدولاب',
      uri: signedUrls.data[item.id] ?? undefined,
      mimeType: item.mime_type ?? undefined,
      fileName: item.storage_path.split('/').pop(),
      sizeBytes: item.size_bytes ?? undefined,
    })).filter((item) => !!item.uri);
    const remoteItems: ShareableItem[] = snapshot.data.items.slice(0, 6).map((item) => ({
      id: `remote-item-${item.id}`,
      kind: 'text' as const,
      title: item.title || 'عنصر من الدولاب',
      body: [item.title, item.description].filter(Boolean).join('\n'),
    })).filter((item) => !!item.body?.trim());
    return { ok: true, items: [...remoteNotes, ...remoteMedia, ...remoteItems].slice(0, 10) };
  } catch {
    return { ok: false, message: 'تعذر تحميل عناصر الدولاب حالياً.' };
  }
}

export async function saveComposerDraftToDolab(input: { text?: string; attachment?: ComposerAttachment | null }): Promise<DolabSaveResult> {
  try {
    const text = input.text?.trim();
    const attachment = input.attachment;
    let savedText = false;
    let savedMedia = false;
    let alreadySaved = false;
    if (!text && !attachment) return { ok: false, message: 'اكتب حاجة أو اختار ميديا الأول.' };
    if (text) {
      const textResult = await saveTextNote(text, 'direct-chat composer draft');
      savedText = textResult === 'saved';
      alreadySaved = textResult === 'already';
    }
    if (attachment) {
      const mediaType = inferSupportedFileKind({ kind: attachment.kind, mimeType: attachment.mimeType, uri: attachment.uri, name: attachment.fileName });
      if (mediaType) {
        const result = await saveMedia(buildPendingMedia({ idPrefix: 'composer-media', uri: attachment.uri, mediaType, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }), { allowLocalOnly: attachment.kind !== 'file' || isRemoteUri(attachment.uri) });
        if (result === 'saved') savedMedia = true;
        else if (result === 'already') alreadySaved = true;
        else if (result === 'unsupported') return { ok: false, message: UNSUPPORTED_MESSAGE };
      } else {
        const result = await saveRemoteFileMetadata({ uri: attachment.uri, title: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, source: 'direct-chat composer draft' });
        if (result === 'saved') savedText = true;
        else if (result === 'already') alreadySaved = true;
        else return { ok: false, message: UNSUPPORTED_MESSAGE };
      }
    }
    if (!savedText && !savedMedia && alreadySaved) return { ok: true, alreadySaved: true };
    return { ok: true, savedText, savedMedia, alreadySaved };
  } catch {
    return { ok: false, message: FAILURE_MESSAGE };
  }
}
