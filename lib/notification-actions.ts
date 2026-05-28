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
      buttonTitle: 'Reply',
      options: {
        opensAppToForeground: true,
        isAuthenticationRequired: false,
      },
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Write a reply…',
      },
    },
    {
      identifier: DIRECT_REACT_LIKE_ACTION_ID,
      buttonTitle: 'Like',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: DIRECT_OPEN_CHAT_ACTION_ID,
      buttonTitle: 'Open Chat',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).catch((error) => {
    if (__DEV__) {
      console.log('[PushActions] register categories failed', {
        message: (error as { message?: string })?.message,
      });
    }
  });

  return registerPromise;
}
