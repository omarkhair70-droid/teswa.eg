export type DolabInboxItemType = 'text' | 'link' | 'image' | 'video' | 'file';

export type DolabInboxItemSource = 'share_intent' | 'clipboard' | 'document_picker' | 'manual';

export type DolabInboxItem = {
  id: string;
  type: DolabInboxItemType;
  source: DolabInboxItemSource;
  title: string;
  body?: string;
  uri?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  convertedAt?: string;
};

const buildId = () => `dolab-inbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const isLikelyUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());

export const createInboxTextItem = (input: { body: string; source: DolabInboxItemSource }): DolabInboxItem => {
  const cleanBody = input.body.trim();
  const linkType = isLikelyUrl(cleanBody);
  return {
    id: buildId(),
    type: linkType ? 'link' : 'text',
    source: input.source,
    title: linkType ? 'رابط محفوظ' : cleanBody.slice(0, 60) || 'ملاحظة سريعة',
    body: cleanBody,
    createdAt: new Date().toISOString(),
  };
};

export const createInboxFileItem = (input: {
  source: DolabInboxItemSource;
  uri: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}): DolabInboxItem => {
  const mime = (input.mimeType ?? '').toLowerCase();
  const type: DolabInboxItemType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file';
  return {
    id: buildId(),
    type,
    source: input.source,
    title: input.fileName || (type === 'image' ? 'صورة واردة' : type === 'video' ? 'فيديو وارد' : 'ملف وارد'),
    uri: input.uri,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
  };
};

export const formatInboxSourceLabel = (source: DolabInboxItemSource): string => {
  if (source === 'clipboard') return 'من الحافظة';
  if (source === 'document_picker') return 'من الملفات';
  if (source === 'share_intent') return 'من المشاركة';
  return 'إدخال يدوي';
};

export const formatInboxTypeLabel = (type: DolabInboxItemType): string => {
  if (type === 'text') return 'نص';
  if (type === 'link') return 'رابط';
  if (type === 'image') return 'صورة';
  if (type === 'video') return 'فيديو';
  return 'ملف';
};
