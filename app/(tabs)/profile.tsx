import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError(null);

    const result = await signOut();
    if (!result.ok) {
      setSignOutError(result.message);
    }

    setIsSigningOut(false);
  };

  return (
    <AppScreen>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>حسابي</AppText>

        <AppCard>
          <View style={styles.cardContent}>
            <AppText weight="semibold">البريد الإلكتروني</AppText>
            <AppText>{user?.email ?? 'لا يوجد بريد إلكتروني متاح حالياً.'}</AppText>
          </View>
        </AppCard>

        <AppText muted>تقدر تسجل خروجك وتدخل بحساب مختلف وقت ما تحب.</AppText>

        {signOutError ? <AppText style={styles.errorText}>{signOutError}</AppText> : null}

        <AppButton
          label={isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
          disabled={isSigningOut}
          onPress={handleSignOut}
          variant="neutral"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  title: { fontSize: 24 },
  cardContent: { gap: spacing.xs },
  errorText: { color: '#B00020' },
});
