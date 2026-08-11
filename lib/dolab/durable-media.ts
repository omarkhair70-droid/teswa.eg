import { Directory, File, Paths } from 'expo-file-system';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';

const DOLAB_MEDIA_DIRECTORY_NAME = 'teswa-dolab-media';
const DOLAB_INBOX_DIRECTORY_NAME = 'teswa-dolab-inbox';
const DEFAULT_EXTENSION_BY_TYPE: Record<'image' | 'video' | 'audio', string> = {
  image: 'jpg',
  video: 'mp4',
  audio: 'm4a',
};

const MIME_TYPE_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

function extensionFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  const clean = fileName.split('?')[0];
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === clean.length - 1) return null;
  return clean.slice(dotIndex + 1).toLowerCase();
}

function extensionFromMimeType(mimeType?: string): string | null {
  if (!mimeType) return null;
  return MIME_TYPE_EXTENSION_MAP[mimeType.toLowerCase()] ?? null;
}

function extensionFromUri(uri: string): string | null {
  const withoutQuery = uri.split('?')[0];
  const chunk = withoutQuery.split('/').pop();
  return extensionFromFileName(chunk);
}

function inferExtension(input: { fileName?: string; mimeType?: string; uri: string; mediaType: 'image' | 'video' | 'audio' }): string {
  return (
    extensionFromFileName(input.fileName) ??
    extensionFromMimeType(input.mimeType) ??
    extensionFromUri(input.uri) ??
    DEFAULT_EXTENSION_BY_TYPE[input.mediaType]
  );
}

function durableDirectory(name: string): Directory | null {
  try {
    const directory = new Directory(Paths.document, name);
    directory.create({ idempotent: true, intermediates: true });
    return directory;
  } catch {
    return null;
  }
}

function dolabMediaDirectory(): Directory | null {
  return durableDirectory(DOLAB_MEDIA_DIRECTORY_NAME);
}

function generateDurableFileName(input: { mediaType: 'image' | 'video' | 'audio'; fileName?: string; mimeType?: string; uri: string }): string {
  const ext = inferExtension(input);
  return `dolab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

function generateInboxFileName(input: { fileName?: string; mimeType?: string; uri: string }): string {
  const ext = extensionFromFileName(input.fileName) ?? extensionFromMimeType(input.mimeType) ?? extensionFromUri(input.uri) ?? 'bin';
  return `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

export async function copyDolabMediaToDurableUri(input: {
  uri: string;
  mediaType: 'image' | 'video' | 'audio';
  fileName?: string;
  mimeType?: string;
}): Promise<{ uri: string; fileName?: string; wasCopied: boolean }> {
  const directory = dolabMediaDirectory();
  if (!directory || !input.uri) {
    return { uri: input.uri, fileName: input.fileName, wasCopied: false };
  }

  try {
    const targetFileName = generateDurableFileName(input);
    const sourceFile = new File(input.uri);
    const targetFile = new File(directory, targetFileName);
    sourceFile.copy(targetFile);
    return { uri: targetFile.uri, fileName: targetFileName, wasCopied: true };
  } catch {
    return { uri: input.uri, fileName: input.fileName, wasCopied: false };
  }
}

export async function copyDolabInboxFileToDurableUri(input: {
  uri: string;
  fileName?: string;
  mimeType?: string;
}): Promise<{ uri: string; fileName?: string; wasCopied: boolean }> {
  const directory = durableDirectory(DOLAB_INBOX_DIRECTORY_NAME);
  if (!directory || !input.uri) {
    return { uri: input.uri, fileName: input.fileName, wasCopied: false };
  }

  try {
    const targetFileName = generateInboxFileName(input);
    const sourceFile = new File(input.uri);
    const targetFile = new File(directory, targetFileName);
    sourceFile.copy(targetFile);
    return { uri: targetFile.uri, fileName: targetFileName, wasCopied: true };
  } catch {
    return { uri: input.uri, fileName: input.fileName, wasCopied: false };
  }
}

export async function makePendingMediaDurable(item: DolabPendingMedia): Promise<DolabPendingMedia> {
  const result = await copyDolabMediaToDurableUri({
    uri: item.uri,
    mediaType: item.mediaType,
    fileName: item.fileName,
    mimeType: item.mimeType,
  });

  if (!result.wasCopied) {
    return item;
  }

  return {
    ...item,
    uri: result.uri,
    fileName: result.fileName ?? item.fileName,
    originalUri: item.originalUri ?? item.uri,
  };
}
