import * as Sharing from 'expo-sharing';
import { shareMarketplaceItem } from '@/lib/share-item';

export type ItemCardSharePayload = {
  id: string;
  title: string;
};

export type ShareItemCardResult =
  | { ok: true; mode: 'image' | 'text' }
  | { ok: false; message: string };

function normalizeCapturedUri(uri: string | null | undefined): string | null {
  const value = uri?.trim();
  if (!value) return null;
  if (value.startsWith('file://')) return value;
  if (value.startsWith('/')) return `file://${value}`;
  return null;
}

export async function shareMarketplaceItemCard(params: {
  item: ItemCardSharePayload;
  capture: () => Promise<string>;
}): Promise<ShareItemCardResult> {
  try {
    const sharingAvailable = await Sharing.isAvailableAsync();

    if (!sharingAvailable) {
      await shareMarketplaceItem(params.item);
      return { ok: true, mode: 'text' };
    }

    const capturedUri = normalizeCapturedUri(await params.capture());
    if (!capturedUri) {
      await shareMarketplaceItem(params.item);
      return { ok: true, mode: 'text' };
    }

    await Sharing.shareAsync(capturedUri, {
      mimeType: 'image/png',
      dialogTitle: 'مشاركة كارت العنصر',
      UTI: 'public.png',
    });

    return { ok: true, mode: 'image' };
  } catch (error) {
    if (__DEV__) {
      console.warn('[share-item-card] share failed, falling back to text', error);
    }

    try {
      await shareMarketplaceItem(params.item);
      return { ok: true, mode: 'text' };
    } catch {
      return { ok: false, message: 'تعذر مشاركة الكارت حالياً. جرّب مرة أخرى.' };
    }
  }
}
