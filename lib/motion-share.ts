import * as Sharing from 'expo-sharing';

export type MotionShareMoment =
  | {
      kind: 'moving_item';
      itemId: string;
      title: string;
      badge: string;
      metadata: string | null;
      ownerDisplayName: string | null;
      imageUrl: string | null;
    }
  | {
      kind: 'story_item';
      itemId: string;
      title: string;
      storyLabel: string;
      storySnippet: string;
      metadata: string | null;
      ownerDisplayName: string | null;
      imageUrl: string | null;
    };

export type ShareCapturedMotionMomentResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'sharing_unavailable' | 'capture_missing' | 'share_failed';
      message: string;
    };

export async function shareCapturedMotionMoment(input: {
  capture: () => Promise<string>;
}): Promise<ShareCapturedMotionMomentResult> {
  const isAvailable = await Sharing.isAvailableAsync();

  if (!isAvailable) {
    return {
      ok: false,
      reason: 'sharing_unavailable',
      message: 'المشاركة غير متاحة على هذا الجهاز حالياً.',
    };
  }

  const capturedUri = (await input.capture())?.trim();

  if (!capturedUri || (!capturedUri.startsWith('file://') && !capturedUri.startsWith('/'))) {
    return {
      ok: false,
      reason: 'capture_missing',
      message: 'تعذر تجهيز لقطة المشاركة.',
    };
  }

  const normalizedUri = capturedUri.startsWith('file://') ? capturedUri : `file://${capturedUri}`;

  try {
    await Sharing.shareAsync(normalizedUri, {
      mimeType: 'image/png',
      dialogTitle: 'شارك نبض تِسوى',
    });

    return { ok: true };
  } catch (error) {
    if (__DEV__) {
      console.warn('[motion-share] Failed to share captured moment', error);
    }

    return {
      ok: false,
      reason: 'share_failed',
      message: 'تعذر فتح المشاركة حالياً.',
    };
  }
}
