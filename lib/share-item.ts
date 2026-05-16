import { Share } from 'react-native';
import * as Linking from 'expo-linking';

type ShareMarketplaceItemInput = {
  id: string;
  title: string;
};

function buildMarketplaceItemUrl(id: string): string {
  return Linking.createURL(`/item/${id}`);
}

export async function shareMarketplaceItem({ id, title }: ShareMarketplaceItemInput): Promise<'shared' | 'dismissed'> {
  const itemUrl = buildMarketplaceItemUrl(id);
  const message = `شوف العنصر ده على تِسوى: ${title}\n${itemUrl}`;

  const result = await Share.share({
    message,
    title,
  });

  if (result.action === Share.dismissedAction) {
    return 'dismissed';
  }

  return 'shared';
}
