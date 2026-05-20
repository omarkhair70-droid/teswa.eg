import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen name="login" options={{ title: 'تسجيل الدخول' }} />
      <Stack.Screen name="signup" options={{ title: 'إنشاء حساب' }} />
      <Stack.Screen name="onboarding" options={{ title: 'مرحبًا بك' }} />
      <Stack.Screen name="profile-setup" options={{ title: 'إكمال الملف' }} />
      <Stack.Screen name="policy-acceptance" options={{ title: 'الموافقة على السياسات' }} />
      <Stack.Screen name="splash" options={{ headerShown: false }} />
    </Stack>
  );
}
