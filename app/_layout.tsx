import { Stack } from 'expo-router';
import { useRTLSetup } from '@/hooks/useRTLSetup';

export default function RootLayout() {
  useRTLSetup();
  return <Stack screenOptions={{ headerShown: false }} />;
}
