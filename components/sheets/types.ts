import type { BottomSheetModalProps } from '@gorhom/bottom-sheet';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type AppBottomSheetProps = {
  title?: string;
  description?: string;
  titleIconName?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  snapPoints?: BottomSheetModalProps['snapPoints'];
  onClose?: () => void;
  enablePanDownToClose?: boolean;
};

export type AppActionSheetTone = 'neutral' | 'primary' | 'danger';

export type AppActionSheetAction = {
  label: string;
  description?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
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
