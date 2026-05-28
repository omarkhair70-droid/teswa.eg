import Toast from 'react-native-toast-message';

type ToastKind = 'success' | 'error' | 'info';

type ShowToastOptions = {
  type?: ToastKind;
  title: string;
  message?: string;
};

export function showToast({ type = 'info', title, message }: ShowToastOptions) {
  Toast.show({
    type,
    text1: title,
    text2: message,
  });
}

export function hideToast() {
  Toast.hide();
}
