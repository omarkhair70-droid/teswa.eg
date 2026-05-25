export const STREAM_CHAT_ENABLED = false;

export const STREAM_CHAT_API_KEY = process.env.EXPO_PUBLIC_STREAM_CHAT_API_KEY ?? '';

export const hasStreamChatConfig = STREAM_CHAT_API_KEY.trim().length > 0;
