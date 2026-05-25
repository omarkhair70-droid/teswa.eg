export const STREAM_CHAT_ENABLED = false;

export const STREAM_CHAT_API_KEY = process.env.EXPO_PUBLIC_STREAM_CHAT_API_KEY ?? '';
export const STREAM_CHAT_TEST_USER_ID = process.env.EXPO_PUBLIC_STREAM_CHAT_TEST_USER_ID ?? '';
export const STREAM_CHAT_TEST_USER_TOKEN = process.env.EXPO_PUBLIC_STREAM_CHAT_TEST_USER_TOKEN ?? '';
export const STREAM_CHAT_TEST_CHANNEL_ID = process.env.EXPO_PUBLIC_STREAM_CHAT_TEST_CHANNEL_ID ?? '';

export const hasStreamChatConfig = STREAM_CHAT_API_KEY.trim().length > 0;
export const hasStreamChatLabConfig =
  hasStreamChatConfig &&
  STREAM_CHAT_TEST_USER_ID.trim().length > 0 &&
  STREAM_CHAT_TEST_USER_TOKEN.trim().length > 0;
