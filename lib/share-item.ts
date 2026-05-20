import { Share } from 'react-native';
import * as Linking from 'expo-linking';

const PUBLIC_SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL?.trim() ?? '';

type ShareMarketplaceItemInput = {
  id: string;
  title: string;
};

function normalizePublicBaseUrl(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, '');
}

function buildMarketplaceItemUrl(id: string): string {
  const publicBaseUrl = normalizePublicBaseUrl(PUBLIC_SHARE_BASE_URL);
  if (publicBaseUrl) {
    return `${publicBaseUrl}/item/${encodeURIComponent(id)}`;
  }

  return Linking.createURL(`/item/${id}`);
}

export async function shareMarketplaceItem({ id, title }: ShareMarketplaceItemInput): Promise<'shared' | 'dismissed'> {
  const itemUrl = buildMarketplaceItemUrl(id);
  const hasPublicUrl = /^https?:\/\//i.test(itemUrl);
  const message = hasPublicUrl
    ? `شوف العنصر ده على تِسوى: ${title}\n${itemUrl}`
    : `شوف العنصر ده على تِسوى: ${title}\nافتح تِسوى وابحث عن العنصر داخل السوق.\n${itemUrl}`;

  const result = await Share.share({
    message,
    title,
  });

  if (result.action === Share.dismissedAction) {
    return 'dismissed';
  }

  return 'shared';
}
