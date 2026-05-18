import type { ImagePickerAsset } from 'expo-image-picker';
import { compressItemImage } from '@/lib/media/compress-item-image';
import { supabase } from '@/lib/supabase/client';

const ITEM_IMAGES_BUCKET = 'item-images';
const MAX_ITEM_IMAGES = 4;
const ITEM_IMAGES_PUBLIC_MARKER = '/storage/v1/object/public/item-images/';

export type EditableListingImage = {
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number | null;
  createdAt: string | null;
};

export type EditableListingImagesContext = {
  itemId: string;
  title: string;
  status: 'active' | 'archived';
  images: EditableListingImage[];
};

export type ListingImageDraftInput =
  | { kind: 'existing'; imageUrl: string }
  | { kind: 'new'; asset: ImagePickerAsset };

export type UpdateListingImagesProgress =
  | { phase: 'optimizing'; current: number; total: number }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'saving' };

export type UpdateListingImagesResult =
  | { ok: true; imageCount: number; storageCleanupFailed?: true }
  | {
      ok: false;
      reason:
        | 'not_found_or_unauthorized'
        | 'not_editable'
        | 'invalid_input'
        | 'upload_failed'
        | 'images_insert_failed'
        | 'images_metadata_update_failed'
        | 'images_delete_failed'
        | 'unknown';
      message: string;
    };

function sanitizeFileName(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

function deriveStoragePathFromPublicUrl(url: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const markerIndex = trimmed.indexOf(ITEM_IMAGES_PUBLIC_MARKER);
  if (markerIndex < 0) return null;
  const afterMarker = trimmed.slice(markerIndex + ITEM_IMAGES_PUBLIC_MARKER.length).split('?')[0];
  if (!afterMarker) return null;
  try {
    return decodeURIComponent(afterMarker);
  } catch {
    return afterMarker;
  }
}

export async function fetchEditableListingImagesContext(itemId: string, ownerId: string): Promise<EditableListingImagesContext | null> {
  const { data: item, error } = await supabase
    .from('items')
    .select('id,title,status')
    .eq('id', itemId)
    .eq('owner_id', ownerId)
    .in('status', ['active', 'archived'])
    .maybeSingle();

  if (error) throw error;
  if (!item) return null;

  const { data: images, error: imagesError } = await supabase
    .from('item_images')
    .select('image_url,is_primary,sort_order,created_at')
    .eq('item_id', itemId);

  if (imagesError) throw imagesError;

  const normalized = (images ?? [])
    .map((entry) => ({
      imageUrl: entry.image_url?.trim() || '',
      isPrimary: Boolean(entry.is_primary),
      sortOrder: typeof entry.sort_order === 'number' ? entry.sort_order : null,
      createdAt: entry.created_at ?? null,
    }))
    .filter((entry) => entry.imageUrl.length > 0)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      const aCreated = a.createdAt ?? '';
      const bCreated = b.createdAt ?? '';
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
      return a.imageUrl.localeCompare(b.imageUrl);
    });

  return {
    itemId: item.id,
    title: item.title?.trim() || 'عنصر بدون عنوان',
    status: item.status,
    images: normalized,
  };
}

export async function updateListingImagesFromMobile(input: {
  itemId: string;
  ownerId: string;
  orderedImages: ListingImageDraftInput[];
  onProgress?: (progress: UpdateListingImagesProgress) => void;
}): Promise<UpdateListingImagesResult> {
  const { itemId, ownerId, orderedImages, onProgress } = input;

  if (!itemId || !ownerId) return { ok: false, reason: 'invalid_input', message: 'بيانات العنصر غير مكتملة.' };
  if (!orderedImages.length) return { ok: false, reason: 'invalid_input', message: 'يجب الاحتفاظ بصورة واحدة على الأقل للعنصر.' };
  if (orderedImages.length > MAX_ITEM_IMAGES) return { ok: false, reason: 'invalid_input', message: 'يمكنك استخدام 4 صور كحد أقصى.' };

  const { data: item, error: itemError } = await supabase.from('items').select('id,status').eq('id', itemId).eq('owner_id', ownerId).maybeSingle();
  if (itemError) return { ok: false, reason: 'unknown', message: 'تعذر التحقق من صلاحية التعديل حالياً.' };
  if (!item) return { ok: false, reason: 'not_found_or_unauthorized', message: 'العنصر غير موجود أو لا تملك صلاحية تعديله.' };
  if (item.status !== 'active' && item.status !== 'archived') return { ok: false, reason: 'not_editable', message: 'لا يمكن تعديل صور هذا العنصر في حالته الحالية.' };

  const { data: currentRows, error: currentError } = await supabase.from('item_images').select('image_url').eq('item_id', itemId);
  if (currentError) return { ok: false, reason: 'unknown', message: 'تعذر تحميل صور العنصر الحالية.' };

  const currentUrls = new Set((currentRows ?? []).map((row) => row.image_url?.trim()).filter((v): v is string => Boolean(v)));
  const usedExisting = new Set<string>();

  for (const draft of orderedImages) {
    if (draft.kind === 'existing') {
      const imageUrl = draft.imageUrl?.trim();
      if (!imageUrl || !currentUrls.has(imageUrl)) {
        return { ok: false, reason: 'invalid_input', message: 'تعذر التحقق من بعض الصور الحالية. أعد فتح الشاشة وحاول مرة أخرى.' };
      }
      if (usedExisting.has(imageUrl)) {
        return { ok: false, reason: 'invalid_input', message: 'لا يمكن تكرار نفس الصورة أكثر من مرة.' };
      }
      usedExisting.add(imageUrl);
    } else {
      if (!draft.asset?.uri) return { ok: false, reason: 'invalid_input', message: 'تعذر قراءة إحدى الصور الجديدة.' };
      if (draft.asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(draft.asset.mimeType)) {
        return { ok: false, reason: 'invalid_input', message: 'نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WEBP.' };
      }
    }
  }

  const uploadedPaths: string[] = [];
  const finalUrls: string[] = [];
  const newUploadedRows: { image_url: string; is_primary: boolean; sort_order: number }[] = [];

  try {
    for (let i = 0; i < orderedImages.length; i += 1) {
      const draft = orderedImages[i];
      if (draft.kind === 'existing') {
        finalUrls.push(draft.imageUrl.trim());
        continue;
      }

      onProgress?.({ phase: 'optimizing', current: i + 1, total: orderedImages.length });
      const optimized = await compressItemImage(draft.asset.uri);
      const ext = optimized.usedCompressedOutput
        ? optimized.extension
        : draft.asset.fileName?.split('.').pop() || (draft.asset.mimeType?.split('/').pop() ?? 'jpg');
      const baseName = optimized.usedCompressedOutput ? `image-${i + 1}.jpg` : draft.asset.fileName;
      const safeName = sanitizeFileName(baseName, `image-${i + 1}.${ext}`);
      const path = `items/${ownerId}/${itemId}/${Date.now()}-${safeName}`;
      const contentType = optimized.usedCompressedOutput ? optimized.contentType : draft.asset.mimeType || 'image/jpeg';

      onProgress?.({ phase: 'uploading', current: i + 1, total: orderedImages.length });
      const body = await fileUriToArrayBuffer(optimized.uri);
      const { error: uploadError } = await supabase.storage.from(ITEM_IMAGES_BUCKET).upload(path, body, { contentType, upsert: false });
      if (uploadError) {
        await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(uploadedPaths);
        return { ok: false, reason: 'upload_failed', message: 'تعذر رفع الصور الجديدة. تأكد من الاتصال وحاول مرة أخرى.' };
      }

      uploadedPaths.push(path);
      const { data: publicUrlData } = supabase.storage.from(ITEM_IMAGES_BUCKET).getPublicUrl(path);
      const imageUrl = publicUrlData.publicUrl;
      finalUrls.push(imageUrl);
      newUploadedRows.push({ image_url: imageUrl, is_primary: i === 0, sort_order: i });
    }

    onProgress?.({ phase: 'saving' });

    if (newUploadedRows.length) {
      const { error: insertError } = await supabase
        .from('item_images')
        .insert(newUploadedRows.map((row) => ({ item_id: itemId, image_url: row.image_url, is_primary: row.is_primary, sort_order: row.sort_order })));
      if (insertError) {
        await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(uploadedPaths);
        return { ok: false, reason: 'images_insert_failed', message: 'تعذر حفظ الصور الجديدة. حاول مرة أخرى.' };
      }
    }

    for (let i = 0; i < finalUrls.length; i += 1) {
      const imageUrl = finalUrls[i];
      const { error: updateError } = await supabase
        .from('item_images')
        .update({ is_primary: i === 0, sort_order: i })
        .eq('item_id', itemId)
        .eq('image_url', imageUrl);

      if (updateError) {
        if (newUploadedRows.length) {
          await supabase.from('item_images').delete().eq('item_id', itemId).in('image_url', newUploadedRows.map((row) => row.image_url));
        }
        await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(uploadedPaths);
        return { ok: false, reason: 'images_metadata_update_failed', message: 'تعذر حفظ ترتيب الصور بالكامل. أعد فتح الشاشة وحاول مرة أخرى.' };
      }
    }

    const keptExistingUrls = new Set(finalUrls.filter((url) => currentUrls.has(url)));
    const removedExistingUrls = [...currentUrls].filter((url) => !keptExistingUrls.has(url));

    if (removedExistingUrls.length) {
      const { error: deleteError } = await supabase.from('item_images').delete().eq('item_id', itemId).in('image_url', removedExistingUrls);
      if (deleteError) {
        return {
          ok: false,
          reason: 'images_delete_failed',
          message: 'تم حفظ الصور الجديدة والترتيب، لكن تعذر حذف بعض الصور القديمة. حاول مرة أخرى.',
        };
      }

      const removablePaths = removedExistingUrls.map(deriveStoragePathFromPublicUrl).filter((v): v is string => Boolean(v));
      if (removablePaths.length) {
        const { error: cleanupError } = await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(removablePaths);
        if (cleanupError) return { ok: true, imageCount: finalUrls.length, storageCleanupFailed: true };
      }
    }

    return { ok: true, imageCount: finalUrls.length };
  } catch {
    await supabase.storage.from(ITEM_IMAGES_BUCKET).remove(uploadedPaths);
    return { ok: false, reason: 'unknown', message: 'حدث خطأ غير متوقع أثناء حفظ الصور.' };
  }
}
