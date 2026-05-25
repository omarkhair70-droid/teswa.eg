import type { DolabDraftItem } from '@/lib/dolab/draft-types';

const MAX_SHARE_BODY_LENGTH = 1200;

export function buildDolabShareToChatBody(input: {
  shareText: string;
  linkedDraft?: DolabDraftItem;
  linkedMediaCount: number;
}): string {
  const lines: string[] = ['من دولابي في تِسوى:'];
  const cleanedBody = sanitizeShareBody(input.shareText);

  if (cleanedBody) {
    lines.push(cleanedBody);
  }

  const linkedDraftTitle = input.linkedDraft?.title ? sanitizeShareBody(input.linkedDraft.title) : '';
  if (linkedDraftTitle) {
    lines.push('', `العنوان المرتبط: ${linkedDraftTitle}`);
  }

  if (input.linkedMediaCount > 0) {
    lines.push('', `مرفق من الدولاب: ${input.linkedMediaCount} ميديا محفوظة`);
    lines.push('الميديا محفوظة في الدولاب، افتحها من هناك.');
  }

  return clampMessage(lines.join('\n').trim());
}

function sanitizeShareBody(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, '[رابط مخفي]')
    .replace(/\b[a-z0-9_-]+\/[a-z0-9_\-/\.]+\b/gi, '[مسار مخفي]')
    .trim();
}

function clampMessage(value: string): string {
  if (value.length <= MAX_SHARE_BODY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_SHARE_BODY_LENGTH - 1).trim()}…`;
}
