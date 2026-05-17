import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ItemCondition } from '@/lib/publish-item';

const ADD_ITEM_DRAFT_VERSION = 1 as const;
const ADD_ITEM_DRAFT_PREFIX = 'teswa:add_item_draft:v1';
const CONDITION_VALUES: ItemCondition[] = ['almost_new', 'good_used', 'minor_issues', 'needs_repair'];
const DESIRE_MODE_VALUES = ['specific', 'flexible', 'surprise'] as const;

type DesireMode = (typeof DESIRE_MODE_VALUES)[number];

export type AddItemDraftMediaAsset = {
  uri: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  width: number;
  height: number;
};

export type AddItemDraft = {
  version: typeof ADD_ITEM_DRAFT_VERSION;
  updatedAt: string;
  step: number;
  title: string;
  categoryId: string | null;
  city: string;
  area: string;
  condition: ItemCondition;
  conditionNotes: string;
  description: string;
  itemStory: string;
  swapReason: string;
  goodFor: string;
  desireMode: DesireMode;
  desireText: string;
  wantedTags: string;
  mediaAssets: AddItemDraftMediaAsset[];
};

const sanitizeString = (value: unknown) => (typeof value === 'string' ? value : '');
const sanitizeNullableString = (value: unknown) => (typeof value === 'string' ? value : null);

const isValidCondition = (value: unknown): value is ItemCondition => CONDITION_VALUES.includes(value as ItemCondition);
const isValidDesireMode = (value: unknown): value is DesireMode => DESIRE_MODE_VALUES.includes(value as DesireMode);

const sanitizeStep = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};


const sanitizeMediaAsset = (value: unknown): AddItemDraftMediaAsset | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<AddItemDraftMediaAsset>;
  const uri = sanitizeString(input.uri).trim();
  if (!uri) return null;
  const width = typeof input.width === 'number' && Number.isFinite(input.width) ? Math.max(0, Math.floor(input.width)) : 0;
  const height = typeof input.height === 'number' && Number.isFinite(input.height) ? Math.max(0, Math.floor(input.height)) : 0;

  return {
    uri,
    fileName: sanitizeNullableString(input.fileName),
    fileSize: typeof input.fileSize === 'number' && Number.isFinite(input.fileSize) ? Math.max(0, input.fileSize) : null,
    mimeType: sanitizeNullableString(input.mimeType),
    width,
    height,
  };
};

const sanitizeMediaAssets = (value: unknown): AddItemDraftMediaAsset[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => sanitizeMediaAsset(entry)).filter((entry): entry is AddItemDraftMediaAsset => !!entry);
};

const sanitizeAddItemDraft = (value: unknown): AddItemDraft | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<AddItemDraft>;
  if (input.version !== ADD_ITEM_DRAFT_VERSION) return null;

  const condition = isValidCondition(input.condition) ? input.condition : 'good_used';
  const desireMode = isValidDesireMode(input.desireMode) ? input.desireMode : 'flexible';

  return {
    version: ADD_ITEM_DRAFT_VERSION,
    updatedAt: sanitizeString(input.updatedAt) || new Date(0).toISOString(),
    step: sanitizeStep(input.step),
    title: sanitizeString(input.title),
    categoryId: sanitizeNullableString(input.categoryId),
    city: sanitizeString(input.city),
    area: sanitizeString(input.area),
    condition,
    conditionNotes: sanitizeString(input.conditionNotes),
    description: sanitizeString(input.description),
    itemStory: sanitizeString(input.itemStory),
    swapReason: sanitizeString(input.swapReason),
    goodFor: sanitizeString(input.goodFor),
    desireMode,
    desireText: sanitizeString(input.desireText),
    wantedTags: sanitizeString(input.wantedTags),
    mediaAssets: sanitizeMediaAssets((input as { mediaAssets?: unknown }).mediaAssets),
  };
};

export const getAddItemDraftStorageKey = (userId?: string | null) => `${ADD_ITEM_DRAFT_PREFIX}:${userId || 'anonymous'}`;

export const loadAddItemDraft = async (userId?: string | null): Promise<AddItemDraft | null> => {
  try {
    const raw = await AsyncStorage.getItem(getAddItemDraftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeAddItemDraft(parsed);
  } catch (error) {
    if (__DEV__) console.log('[add-item-draft] load failed', { message: (error as { message?: string })?.message });
    return null;
  }
};

export const saveAddItemDraft = async (userId: string | null | undefined, draft: AddItemDraft): Promise<void> => {
  const payload: AddItemDraft = {
    ...draft,
    version: ADD_ITEM_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
    step: sanitizeStep(draft.step),
    condition: isValidCondition(draft.condition) ? draft.condition : 'good_used',
    desireMode: isValidDesireMode(draft.desireMode) ? draft.desireMode : 'flexible',
    mediaAssets: sanitizeMediaAssets((draft as { mediaAssets?: unknown }).mediaAssets),
  };

  await AsyncStorage.setItem(getAddItemDraftStorageKey(userId), JSON.stringify(payload));
};

export const clearAddItemDraft = async (userId?: string | null): Promise<void> => {
  await AsyncStorage.removeItem(getAddItemDraftStorageKey(userId));
};

export const hasMeaningfulAddItemDraft = (draftInput: Partial<AddItemDraft> | null | undefined): boolean => {
  if (!draftInput) return false;

  const hasText = [
    draftInput.title,
    draftInput.city,
    draftInput.area,
    draftInput.conditionNotes,
    draftInput.description,
    draftInput.itemStory,
    draftInput.swapReason,
    draftInput.goodFor,
    draftInput.desireText,
    draftInput.wantedTags,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);

  return hasText
    || (Array.isArray(draftInput.mediaAssets) && draftInput.mediaAssets.length > 0)
    || !!draftInput.categoryId
    || draftInput.condition === 'almost_new'
    || draftInput.condition === 'minor_issues'
    || draftInput.condition === 'needs_repair'
    || draftInput.desireMode === 'specific'
    || draftInput.desireMode === 'surprise';
};

export { ADD_ITEM_DRAFT_VERSION };
