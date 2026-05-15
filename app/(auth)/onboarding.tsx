import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { setOnboardingCompleted } from '@/lib/onboarding';
import { useAuth } from '@/lib/auth';

const slides = [
  { title: 'حاجتك لسه لها قيمة.', body: 'بدل ما تفضل مركونة، خلّيها تفتح باب لحاجة تناسبك.' },
  { title: 'قبل ما تسيبها، شوف تِسوى إيه.', body: 'اعرض حاجتك، وشوف الناس مستعدة تبدّلها بإيه.' },
  { title: 'بدّل ببساطة، واختار اللي يستاهل.', body: 'تجربة معمولة للموبايل من أول يوم، علشان العرض والاختيار يبقوا أوضح وأسهل.' },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const { setOnboardingCompletedState } = useAuth();

  const goToLoginAndCompleteOnboarding = async () => {
    await setOnboardingCompleted(true);
    setOnboardingCompletedState(true);
    router.replace('/(auth)/login');
  };

  const isLast = index === slides.length - 1;
  return (
    <AppScreen style={styles.screen}>
      <View style={styles.topRow}>
        <Pressable onPress={goToLoginAndCompleteOnboarding}><AppText muted>تخطي</AppText></Pressable>
      </View>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>{slides[index].title}</AppText>
        <AppText muted style={styles.body}>{slides[index].body}</AppText>
      </View>
      <View style={styles.dots}>{slides.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotActive]} />)}</View>
      {isLast ? (
        <View style={styles.actions}>
          <AppButton label="ابدأ وسجّل" onPress={goToLoginAndCompleteOnboarding} />
          <Pressable onPress={goToLoginAndCompleteOnboarding}><AppText style={styles.loginLink}>لديك حساب؟ تسجيل الدخول</AppText></Pressable>
        </View>
      ) : (
        <AppButton label="التالي" onPress={() => setIndex((v) => Math.min(v + 1, slides.length - 1))} />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({ screen: { justifyContent: 'space-between' }, topRow: { alignItems: 'flex-start' }, content: { gap: spacing.md, marginTop: spacing.xl }, title: { fontSize: 30, lineHeight: 40 }, body: { fontSize: 18, lineHeight: 30 }, dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }, dot: { width: 8, height: 8, borderRadius: 10, backgroundColor: colors.border }, dotActive: { width: 24, backgroundColor: colors.primary }, actions: { gap: spacing.md }, loginLink: { textAlign: 'center', color: colors.primary } });
