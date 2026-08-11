import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabViewMode } from '@/lib/dolab/organization';
import { DolabShelfCard } from './DolabShelfCard';

type Props = {
  counts: { notes: number; media: number; drafts: number; inbox: number; ideas: number };
  onOpenShelf: (mode: DolabViewMode) => void;
  onQuickNote: () => void;
  onQuickAudio: () => void;
  onQuickCamera: () => void;
  onQuickDraft: () => void;
};

export function DolabShelvesOverview({ counts, onOpenShelf, onQuickNote, onQuickAudio, onQuickCamera, onQuickDraft }: Props) {
  const quickActions = [
    { label: 'نوت سريعة', description: 'فكرة أو ملاحظة', icon: 'create-outline' as const, onPress: onQuickNote },
    { label: 'تسجيل صوتي', description: 'قولها بدل ما تكتب', icon: 'mic-outline' as const, onPress: onQuickAudio },
    { label: 'صوّر حاجة', description: 'احفظها فورًا', icon: 'camera-outline' as const, onPress: onQuickCamera },
    { label: 'مسودة عنصر', description: 'جهّزها للنشر', icon: 'cube-outline' as const, onPress: onQuickDraft },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionHeading}>
        <View style={styles.headingIcon}><Ionicons name="albums-outline" size={18} color={colors.primary} /></View>
        <View style={styles.headingCopy}><AppText muted style={styles.eyebrow}>كل حاجة في مكانها</AppText><AppText weight="bold" style={styles.headingTitle}>رفوف دولابك</AppText><AppText muted style={styles.headingDescription}>افتح الرف اللي محتاجه بدل ما تدور في مكتبة واحدة كبيرة.</AppText></View>
      </View>

      <View style={styles.shelvesGrid}>
        <DolabShelfCard title="الكلام مع نفسي" description="نوتس، ريكوردات، وأفكار سريعة بينك وبين نفسك." iconName="chatbox-ellipses-outline" count={counts.notes} onPress={() => onOpenShelf('notes')} />
        <DolabShelfCard title="رف الميديا" description="صور، فيديوهات، وتسجيلات محفوظة." iconName="images-outline" count={counts.media} onPress={() => onOpenShelf('media')} />
        <DolabShelfCard title="مسودات على الرف" description="حاجات بتتجهز عشان تطلع للسوق." iconName="cube-outline" count={counts.drafts} onPress={() => onOpenShelf('drafts')} />
        <DolabShelfCard title="وارد الدولاب" description="نصوص، روابط، وملفات جاية من برّه التطبيق." iconName="download-outline" count={counts.inbox} onPress={() => onOpenShelf('inbox')} />
        <DolabShelfCard title="درج الأفكار" description="ملاحظات تساعدك تجهز تبديل أذكى." iconName="bulb-outline" count={counts.ideas} onPress={() => onOpenShelf('notes')} />
      </View>

      <View style={styles.quickPanel}>
        <View style={styles.quickHeading}><View style={styles.headingIcon}><Ionicons name="flash-outline" size={18} color={colors.accent} /></View><View style={styles.headingCopy}><AppText muted style={styles.eyebrow}>من غير لف</AppText><AppText weight="bold" style={styles.headingTitle}>إضافة سريعة</AppText></View></View>
        <View style={styles.quickGrid}>
          {quickActions.map((action) => (
            <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
              <View style={styles.quickIcon}><Ionicons name={action.icon} size={19} color={colors.primary} /></View>
              <View style={styles.quickCopy}><AppText weight="semibold" style={styles.quickLabel}>{action.label}</AppText><AppText muted style={styles.quickDescription}>{action.description}</AppText></View>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  sectionHeading: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.xs },
  quickHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  headingIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  headingCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  eyebrow: { fontSize: 10 },
  headingTitle: { fontSize: 17, textAlign: 'right' },
  headingDescription: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  shelvesGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  quickPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quickGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  quickAction: { width: '48.5%', minHeight: 76, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  quickCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  quickLabel: { fontSize: 11, textAlign: 'right' },
  quickDescription: { fontSize: 8, lineHeight: 13, textAlign: 'right' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
