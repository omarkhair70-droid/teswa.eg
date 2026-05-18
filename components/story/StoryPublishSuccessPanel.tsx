import { Pressable, StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export type StoryPublishSuccessPanelProps = {
  onViewStory: () => void;
  onCreateAnother: () => void;
  onManageStories: () => void;
  onReturnProfile: () => void;
};

export function StoryPublishSuccessPanel({ onViewStory, onCreateAnother, onManageStories, onReturnProfile }: StoryPublishSuccessPanelProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.panel}>
        <LottieView source={require('@/assets/lottie/story-publish-success.json')} autoPlay loop={false} style={styles.lottie} />
        <AppText weight="bold" style={styles.title}>قصتك بقت ظاهرة</AppText>
        <AppText muted style={styles.description}>هتعيش في تِسوى لمدة 24 ساعة، وتقدر تشوفها أو تتابع تفاعل الناس عليها.</AppText>
        <AppText muted style={styles.supporting}>النشر تم بنجاح.</AppText>

        <View style={styles.actions}>
          <AppButton label="عرض قصتي الآن" onPress={onViewStory} />
          <AppButton label="إضافة قصة أخرى" variant="neutral" onPress={onCreateAnother} />
          <AppButton label="إدارة قصصي" variant="neutral" onPress={onManageStories} />
          <Pressable onPress={onReturnProfile} style={styles.returnLink}>
            <AppText muted>العودة لحسابي</AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  lottie: { width: 190, height: 190 },
  title: { fontSize: 28, color: colors.text },
  description: { textAlign: 'center', lineHeight: 22 },
  supporting: { color: colors.accent },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  returnLink: { alignItems: 'center', paddingTop: spacing.xs },
});
