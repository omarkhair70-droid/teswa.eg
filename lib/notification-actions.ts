import * as Notifications from 'expo-notifications';

export const DIRECT_MESSAGE_NOTIFICATION_CATEGORY_ID = 'direct_message';
export const DIRECT_REPLY_ACTION_ID = 'direct_reply';
export const DIRECT_REACT_LIKE_ACTION_ID = 'direct_react_like';
export const DIRECT_OPEN_CHAT_ACTION_ID = 'direct_open_chat';

let registerPromise: Promise<void> | null = null;

export function registerNotificationActionCategories() {
  if (registerPromise) return registerPromise;

  registerPromise = Notifications.setNotificationCategoryAsync(DIRECT_MESSAGE_NOTIFICATION_CATEGORY_ID, [
    {
      identifier: DIRECT_REPLY_ACTION_ID,
      buttonTitle: 'رد',
      options: {
        opensAppToForeground: true,
        isAuthenticationRequired: false,
      },
      textInput: {
        submitButtonTitle: 'إرسال',
        placeholder: 'اكتب رد…',
      },
    },
    {
      identifier: DIRECT_REACT_LIKE_ACTION_ID,
      buttonTitle: 'إعجاب',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: DIRECT_OPEN_CHAT_ACTION_ID,
      buttonTitle: 'افتح الشات',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).then(() => undefined).catch((error) => {
    if (__DEV__) {
      console.log('[PushActions] register categories failed', {
        message: (error as { message?: string })?.message,
      });
    }
  });

  return registerPromise;
}
