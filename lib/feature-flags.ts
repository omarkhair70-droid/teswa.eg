const normalizeFlag = (value: string | undefined) => value?.trim().toLowerCase();
const isDisabled = (value: string | undefined) => normalizeFlag(value) === 'false';
const isExplicitlyEnabled = (value: string | undefined) => normalizeFlag(value) === 'true';

export function isDirectChatProEnabled() {
  // Stream-backed Direct Chat is optional. The proven Supabase direct-message
  // path stays on by default so an external Stream outage cannot block chat.
  // Set EXPO_PUBLIC_DIRECT_CHAT_PRO_ENABLED=true only when Stream is healthy.
  return isExplicitlyEnabled(process.env.EXPO_PUBLIC_DIRECT_CHAT_PRO_ENABLED);
}

export function isSwapCeremonyEnabled() {
  return !isDisabled(process.env.EXPO_PUBLIC_SWAP_CEREMONY_ENABLED);
}

export function isDirectVideoPlayerEnabled() {
  return !isDisabled(process.env.EXPO_PUBLIC_DIRECT_VIDEO_PLAYER_ENABLED);
}

export function isPushRegistrationEnabled() {
  return !isDisabled(process.env.EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED);
}
