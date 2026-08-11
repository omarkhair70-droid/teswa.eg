// Temporary compatibility alias for the existing Direct Chat screen.
// The runtime is fully Supabase-native; this file does not call Stream.
export { fetchDirectRuntimeAuth as fetchStreamChatToken } from '@/lib/chat/direct-runtime-auth';
