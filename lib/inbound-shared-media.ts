import type * as ImagePicker from 'expo-image-picker';

let pendingInboundSharedMedia: ImagePicker.ImagePickerAsset[] = [];

export const setPendingInboundSharedMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
  pendingInboundSharedMedia = [...assets];
};

export const hasPendingInboundSharedMedia = () => pendingInboundSharedMedia.length > 0;

export const consumePendingInboundSharedMedia = (): ImagePicker.ImagePickerAsset[] => {
  const next = [...pendingInboundSharedMedia];
  pendingInboundSharedMedia = [];
  return next;
};
