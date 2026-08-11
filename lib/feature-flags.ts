const normalizeFlag = (value: string | undefined) => value?.trim().toLowerCase();
const isDisabled = (value: string | undefined) => normalizeFlag(value) === 'false';
const isExplicitlyEnabled = (value: string | undefined) => normalizeFlag(value) === 'true';

export function isDirectChatProEnabled() {
  // Stream-backed Direct Chat is an optional enhancement. Keep the proven
  // Supabase direct-message path as the default so a Stream outage or missing
  // Stream credentials can never make accepted conversations unusable.
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
