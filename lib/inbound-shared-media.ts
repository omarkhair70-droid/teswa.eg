import type * as ImagePicker from 'expo-image-picker';
import type { DolabInboxItem } from '@/lib/dolab/inbox';

let pendingInboundSharedMedia: ImagePicker.ImagePickerAsset[] = [];
let pendingInboundDolabInboxItems: DolabInboxItem[] = [];

export const setPendingInboundSharedMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
  pendingInboundSharedMedia = [...assets];
};

export const hasPendingInboundSharedMedia = () => pendingInboundSharedMedia.length > 0;

export const consumePendingInboundSharedMedia = (): ImagePicker.ImagePickerAsset[] => {
  const next = [...pendingInboundSharedMedia];
  pendingInboundSharedMedia = [];
  return next;
};

export const setPendingInboundDolabInboxItems = (items: DolabInboxItem[]) => {
  pendingInboundDolabInboxItems = [...items];
};

export const hasPendingInboundDolabInboxItems = () => pendingInboundDolabInboxItems.length > 0;

export const consumePendingInboundDolabInboxItems = (): DolabInboxItem[] => {
  const next = [...pendingInboundDolabInboxItems];
  pendingInboundDolabInboxItems = [];
  return next;
};
