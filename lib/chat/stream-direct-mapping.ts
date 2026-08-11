// Temporary compatibility aliases for the existing Direct Chat screen.
// Channel identity is now provider-neutral and owned by Teswa.
export {
  getDirectChannelConfig as getStreamDirectChannelConfig,
  getDirectChannelId as getStreamDirectChannelId,
} from '@/lib/chat/direct-channel-mapping';
