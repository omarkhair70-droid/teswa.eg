import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { createDolabMediaSignedUrl } from '@/lib/dolab/signed-urls';
import type { DolabMedia, DolabItem } from '@/lib/dolab/types';
import type { ItemCondition } from '@/lib/publish-item';

export type DolabMappedPayload = {
  title: string;
  description: string;
  condition: ItemCondition;
  conditionNotes: string;
  categoryId: string | null;
  desireText: string;
  categoryMatched: boolean;
};

const conditionMap: Record<string, ItemCondition> = {
  almost_new: 'almost_new',
  good_used: 'good_used',
  minor_issues: 'minor_issues',
  needs_repair: 'needs_repair',
};

export const mapDolabItemToAddItemFields = (
  item: DolabItem,
  categories: { id: string; name_ar: string }[],
): DolabMappedPayload => {
  const rawCondition = (item.condition ?? '').trim();
  const normalizedCondition = rawCondition.toLowerCase();
  const mappedCondition = conditionMap[normalizedCondition] ?? 'good_used';

  const matchedCategory = categories.find((category) => (
    category.id === item.category || category.name_ar === item.category
  ));

  return {
    title: item.title ?? '',
    description: item.description ?? '',
    condition: mappedCondition,
    conditionNotes: conditionMap[normalizedCondition] ? '' : rawCondition,
    categoryId: matchedCategory?.id ?? null,
    categoryMatched: Boolean(matchedCategory),
    desireText: '',
  };
};

export async function importDolabImagesToAssets(mediaRows: DolabMedia[]): Promise<{ assets: ImagePicker.ImagePickerAsset[]; warnings: string[] }> {
  const imageMedia = mediaRows.filter((row) => row.media_type === 'image').slice(0, 4);
  const warnings: string[] = [];
  const assets: ImagePicker.ImagePickerAsset[] = [];

  for (const media of imageMedia) {
    const signedUrlResult = await createDolabMediaSignedUrl(media.storage_path);
    if (!signedUrlResult.data) {
      warnings.push('تعذر تجهيز بعض صور الدولاب الآن.');
      continue;
    }

    try {
      const extension = media.mime_type?.split('/')[1] || 'jpg';
      const targetFile = new File(Paths.cache, `dolab-import-${media.id}.${extension}`);
      await File.downloadFileAsync(signedUrlResult.data, targetFile, { idempotent: true });
      const info = targetFile.info();
      if (!info.exists) {
        warnings.push('فشل تنزيل صورة من الدولاب.');
        continue;
      }
      assets.push({
        uri: targetFile.uri,
        fileName: `dolab-${media.id}.${extension}`,
        fileSize: typeof info.size === 'number' ? info.size : (media.size_bytes ?? undefined),
        mimeType: media.mime_type ?? undefined,
        width: media.width ?? 0,
        height: media.height ?? 0,
      });
    } catch {
      warnings.push('فشل تنزيل صورة من الدولاب.');
    }
  }

  return { assets, warnings };
}
