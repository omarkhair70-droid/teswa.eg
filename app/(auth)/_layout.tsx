import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="adventure" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="policy-acceptance" />
      <Stack.Screen name="native-google-diagnostics" />
      <Stack.Screen name="splash" />
    </Stack>
  );
}
