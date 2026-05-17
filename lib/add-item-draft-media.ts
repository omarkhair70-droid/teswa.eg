import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { AddItemDraftMediaAsset } from '@/lib/add-item-draft';

const ROOT_DIR_NAME = 'teswa-add-item-drafts';

const sanitizeUserSegment = (userId?: string | null) => {
  const value = typeof userId === 'string' ? userId.trim() : '';
  if (!value) return 'anonymous';
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anonymous';
};

const safeExtensionFromAsset = (asset: ImagePicker.ImagePickerAsset) => {
  const fromName = asset.fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (asset.mimeType === 'image/png') return 'png';
  if (asset.mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const toFileFromUri = (uri: string) => {
  if (!uri) return null;
  try {
    return new File(uri);
  } catch {
    return null;
  }
};

export const getAddItemDraftMediaDirectory = (userId?: string | null) => {
  const userSegment = sanitizeUserSegment(userId);
  return new Directory(Paths.document, ROOT_DIR_NAME, userSegment);
};

export const persistAddItemDraftMediaAssets = async (
  userId: string | null | undefined,
  incomingAssets: ImagePicker.ImagePickerAsset[],
): Promise<ImagePicker.ImagePickerAsset[]> => {
  const dir = getAddItemDraftMediaDirectory(userId);
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch (error) {
    if (__DEV__) console.log('[add-item-draft-media] create dir failed', { message: (error as { message?: string })?.message });
    return [];
  }

  const persisted: ImagePicker.ImagePickerAsset[] = [];

  for (const asset of incomingAssets) {
    if (!asset?.uri) continue;
    const source = toFileFromUri(asset.uri);
    if (!source) continue;

    try {
      const fileName = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExtensionFromAsset(asset)}`;
      const destination = new File(dir, fileName);
      source.copy(destination);
      const copiedInfo = destination.info();
      if (!copiedInfo.exists) continue;

      persisted.push({
        ...asset,
        uri: destination.uri,
        fileName: asset.fileName ?? fileName,
        fileSize: typeof copiedInfo.size === 'number' ? copiedInfo.size : asset.fileSize,
        mimeType: asset.mimeType ?? undefined,
        width: typeof asset.width === 'number' ? asset.width : 0,
        height: typeof asset.height === 'number' ? asset.height : 0,
      });
    } catch (error) {
      if (__DEV__) console.log('[add-item-draft-media] persist asset failed', { uri: asset.uri, message: (error as { message?: string })?.message });
    }
  }

  return persisted;
};

export const toAddItemDraftMediaAssets = (assets: ImagePicker.ImagePickerAsset[]): AddItemDraftMediaAsset[] => assets
  .filter((asset) => typeof asset?.uri === 'string' && asset.uri.length > 0)
  .map((asset) => ({
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    fileSize: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : null,
    mimeType: asset.mimeType ?? null,
    width: typeof asset.width === 'number' && Number.isFinite(asset.width) ? asset.width : 0,
    height: typeof asset.height === 'number' && Number.isFinite(asset.height) ? asset.height : 0,
  }));

export const restoreAddItemDraftMediaAssets = async (draftMediaAssets: AddItemDraftMediaAsset[]): Promise<ImagePicker.ImagePickerAsset[]> => {
  const restored: ImagePicker.ImagePickerAsset[] = [];

  for (const asset of draftMediaAssets) {
    try {
      const file = toFileFromUri(asset.uri);
      if (!file) continue;
      const info = file.info();
      if (!info.exists) continue;
      restored.push({
        uri: file.uri,
        fileName: asset.fileName ?? null,
        fileSize: typeof info.size === 'number' ? info.size : (asset.fileSize ?? undefined),
        mimeType: asset.mimeType ?? undefined,
        width: asset.width,
        height: asset.height,
      });
    } catch (error) {
      if (__DEV__) console.log('[add-item-draft-media] restore asset failed', { uri: asset.uri, message: (error as { message?: string })?.message });
    }
  }

  return restored;
};

export const deleteAddItemDraftMediaAsset = async (assetOrUri: ImagePicker.ImagePickerAsset | AddItemDraftMediaAsset | string): Promise<void> => {
  const uri = typeof assetOrUri === 'string' ? assetOrUri : assetOrUri?.uri;
  if (!uri) return;

  try {
    const file = toFileFromUri(uri);
    if (!file) return;
    const info = file.info();
    if (info.exists) file.delete();
  } catch (error) {
    if (__DEV__) console.log('[add-item-draft-media] delete asset failed', { uri, message: (error as { message?: string })?.message });
  }
};

export const clearAddItemDraftMedia = async (userId?: string | null): Promise<void> => {
  try {
    const dir = getAddItemDraftMediaDirectory(userId);
    dir.delete();
  } catch (error) {
    if (__DEV__) console.log('[add-item-draft-media] clear dir failed', { message: (error as { message?: string })?.message });
  }
};
