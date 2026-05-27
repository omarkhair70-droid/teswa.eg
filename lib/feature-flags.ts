const isDisabled = (value: string | undefined) => value?.trim().toLowerCase() === 'false';

export function isDirectChatProEnabled() {
  return !isDisabled(process.env.EXPO_PUBLIC_DIRECT_CHAT_PRO_ENABLED);
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
