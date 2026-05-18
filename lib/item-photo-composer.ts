import * as ImagePicker from 'expo-image-picker';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type ItemPhotoComposerAction =
  | 'crop_item_square_1_1'
  | 'rotate_left'
  | 'rotate_right'
  | 'flip_horizontal';

export type ItemPhotoComposerResult =
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

const INVALID_ASSET_RESULT: ItemPhotoComposerResult = {
  ok: false,
  reason: 'invalid_asset',
  message: 'الصورة غير صالحة للتعديل.',
};

export async function composeItemPhotoFromMobile(input: {
  asset: ImagePicker.ImagePickerAsset;
  action: ItemPhotoComposerAction;
}): Promise<ItemPhotoComposerResult> {
  const { asset, action } = input;

  const assetType = asset?.type ?? null;
  const isImageLikeType = assetType === 'image' || assetType === null;
  if (!asset || !asset.uri?.trim() || !isImageLikeType) {
    return INVALID_ASSET_RESULT;
  }

  try {
    const context = ImageManipulator.manipulate(asset.uri);

    switch (action) {
      case 'crop_item_square_1_1': {
        const width = asset.width ?? 0;
        const height = asset.height ?? 0;
        if (width <= 0 || height <= 0) {
          return {
            ok: false,
            reason: 'missing_dimensions',
            message: 'تعذر تحديد أبعاد الصورة لقصّها بشكل متوازن.',
          };
        }

        const side = Math.min(width, height);
        const originX = (width - side) / 2;
        const originY = (height - side) / 2;

        context.crop({
          originX: Math.max(0, Math.round(originX)),
          originY: Math.max(0, Math.round(originY)),
          width: Math.max(1, Math.round(side)),
          height: Math.max(1, Math.round(side)),
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
        fileName: `item-composed-${Date.now()}.jpg`,
      },
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[item-photo-composer] compose failed', error);
    }
    return {
      ok: false,
      reason: 'compose_failed',
      message: 'تعذر تجهيز الصورة حالياً. حاول مرة أخرى.',
    };
  }
}
