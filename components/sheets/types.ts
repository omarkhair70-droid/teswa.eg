import type { BottomSheetModalProps } from '@gorhom/bottom-sheet';
import type { ReactNode } from 'react';

export type AppBottomSheetProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  snapPoints?: BottomSheetModalProps['snapPoints'];
  onClose?: () => void;
  enablePanDownToClose?: boolean;
};

export type AppActionSheetTone = 'neutral' | 'primary' | 'danger';

export type AppActionSheetAction = {
  label: string;
  iconName?: string;
  tone?: AppActionSheetTone;
  onPress: () => void;
  disabled?: boolean;
};

export type AppActionSheetProps = {
  title: string;
  description?: string;
  actions: AppActionSheetAction[];
  onClose?: () => void;
  snapPoints?: BottomSheetModalProps['snapPoints'];
};
