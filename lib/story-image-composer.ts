import * as ImagePicker from 'expo-image-picker';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type StoryImageComposerAction =
  | 'crop_story_9_16'
  | 'rotate_left'
  | 'rotate_right'
  | 'flip_horizontal';

export type StoryImageComposerResult =
  | {
      ok: true;
      asset: ImagePicker.ImagePickerAsset;
    }
  | {
      ok: false;
      reason:
        | 'invalid_asset'
        | 'missing_dimensions'
        | 'unsupported_action'
        | 'compose_failed';
      message: string;
    };

const INVALID_ASSET_RESULT: StoryImageComposerResult = {
  ok: false,
  reason: 'invalid_asset',
  message: 'الصورة غير صالحة للتعديل.',
};

export async function composeStoryImageFromMobile(input: {
  asset: ImagePicker.ImagePickerAsset;
  action: StoryImageComposerAction;
}): Promise<StoryImageComposerResult> {
  const { asset, action } = input;

  if (!asset || asset.type !== 'image' || !asset.uri?.trim()) {
    return INVALID_ASSET_RESULT;
  }

  try {
    const context = ImageManipulator.manipulate(asset.uri);

    switch (action) {
      case 'crop_story_9_16': {
        const width = asset.width ?? 0;
        const height = asset.height ?? 0;
        if (width <= 0 || height <= 0) {
          return {
            ok: false,
            reason: 'missing_dimensions',
            message: 'تعذر تحديد أبعاد الصورة لتهيئتها كقصة.',
          };
        }

        const storyAspect = 9 / 16;
        const originalAspect = width / height;

        let originX = 0;
        let originY = 0;
        let cropWidth = width;
        let cropHeight = height;

        if (originalAspect > storyAspect) {
          cropWidth = height * storyAspect;
          originX = (width - cropWidth) / 2;
        } else {
          cropHeight = width * (16 / 9);
          originY = (height - cropHeight) / 2;
        }

        context.crop({
          originX: Math.max(0, Math.round(originX)),
          originY: Math.max(0, Math.round(originY)),
          width: Math.max(1, Math.round(cropWidth)),
          height: Math.max(1, Math.round(cropHeight)),
        });
        break;
      }
      case 'rotate_right':
        context.rotate(90);
        break;
      case 'rotate_left':
        context.rotate(-90);
        break;
      case 'flip_horizontal':
        context.flip(FlipType.Horizontal);
        break;
      default:
        return {
          ok: false,
          reason: 'unsupported_action',
          message: 'نوع التعديل غير مدعوم حالياً.',
        };
    }

    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.92,
    });

    return {
      ok: true,
      asset: {
        ...asset,
        uri: result.uri,
        type: 'image',
        width: result.width,
        height: result.height,
        mimeType: 'image/jpeg',
        fileName: `story-composed-${Date.now()}.jpg`,
      },
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[story-image-composer] compose failed', error);
    }
    return {
      ok: false,
      reason: 'compose_failed',
      message: 'تعذر تجهيز الصورة حالياً. حاول مرة أخرى.',
    };
  }
}
