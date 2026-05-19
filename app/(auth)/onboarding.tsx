import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { setOnboardingCompleted } from '@/lib/onboarding';
import { useAuth } from '@/lib/auth';

const slides = [
  { eyebrow: 'قيمة', icon: 'sparkles-outline', title: 'حاجتك لسه لها قيمة.', body: 'بدل ما تفضل مركونة، خلّيها تفتح باب لحاجة تناسبك.' },
  { eyebrow: 'اختيار', icon: 'pulse-outline', title: 'قبل ما تسيبها، شوف تِسوى إيه.', body: 'اعرض حاجتك، وشوف الناس مستعدة تبدّلها بإيه.' },
  { eyebrow: 'تبديل', icon: 'swap-horizontal-outline', title: 'بدّل ببساطة، واختار اللي يستاهل.', body: 'تجربة معمولة للموبايل من أول يوم، علشان العرض والاختيار يبقوا أوضح وأسهل.' },
] as const;

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const { setOnboardingCompletedState } = useAuth();
  const goToLoginAndCompleteOnboarding = async () => { await setOnboardingCompleted(true); setOnboardingCompletedState(true); router.replace('/(auth)/login'); };
  const isLast = index === slides.length - 1;
  const activeSlide = slides[index];

  return (
    <AppScreen style={styles.screen} backgroundVariant="alive">
      <View style={styles.topRow}><Pressable style={styles.skip} onPress={goToLoginAndCompleteOnboarding}><AppText>تخطي</AppText></Pressable></View>
      <LinearGradient colors={['#FFF4E6', '#F7E0D2', 'rgba(62,124,115,0.22)']} style={styles.hero}>
        <View style={styles.orbOne} /><View style={styles.orbTwo} />
        <View style={styles.iconShell}><Ionicons name={activeSlide.icon} size={30} color={colors.primary} /></View>
        <AppText style={styles.eyebrow}>{activeSlide.eyebrow}</AppText>
        <AppText weight="bold" style={styles.title}>{activeSlide.title}</AppText>
        <AppText muted style={styles.body}>{activeSlide.body}</AppText>
      </LinearGradient>
      <View style={styles.dots}>{slides.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotActive]} />)}</View>
      {isLast ? <View style={styles.actions}><AppButton label="ابدأ وسجّل" onPress={goToLoginAndCompleteOnboarding} /><Pressable onPress={goToLoginAndCompleteOnboarding}><AppText style={styles.loginLink}>لديك حساب؟ تسجيل الدخول</AppText></Pressable></View> : <AppButton label="التالي" onPress={() => setIndex((v) => Math.min(v + 1, slides.length - 1))} />}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  topRow: { alignItems: 'flex-start' },
  skip: { borderWidth: 1, borderColor: 'rgba(184,98,63,0.3)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: 'rgba(255,253,248,0.75)' },
  hero: { borderRadius: 26, padding: spacing.xl, gap: spacing.md, minHeight: 360, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', overflow: 'hidden' },
  orbOne: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.4)', top: -40, right: -20 },
  orbTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(184,98,63,0.14)', bottom: -20, left: -20 },
  iconShell: { width: 58, height: 58, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.primary, fontSize: 13 },
  title: { fontSize: 30, lineHeight: 40 },
  body: { fontSize: 18, lineHeight: 30 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 10, backgroundColor: 'rgba(184,98,63,0.2)' },
  dotActive: { width: 30, backgroundColor: colors.primary },
  actions: { gap: spacing.md },
  loginLink: { textAlign: 'center', color: colors.primary },
});
