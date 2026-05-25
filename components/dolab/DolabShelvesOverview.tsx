import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
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
  return (
    <View style={styles.wrap}>
      <DolabShelfCard title="الكلام مع نفسي" description="نوتس، ريكوردات، وأفكار سريعة بينك وبين نفسك." iconName="chatbox-ellipses-outline" count={counts.notes} onPress={() => onOpenShelf('notes')} />
      <DolabShelfCard title="رف الميديا" description="صور، فيديوهات، وتسجيلات محفوظة." iconName="images-outline" count={counts.media} onPress={() => onOpenShelf('media')} />
      <DolabShelfCard title="مسودات على الرف" description="حاجات بتتجهز عشان تطلع للسوق." iconName="cube-outline" count={counts.drafts} onPress={() => onOpenShelf('drafts')} />
      <DolabShelfCard title="وارد الدولاب" description="نصوص، روابط، وملفات جاية من برّه التطبيق." iconName="download-outline" count={counts.inbox} onPress={() => onOpenShelf('inbox')} />
      <DolabShelfCard title="درج الأفكار" description="ملاحظات تساعدك تجهز تبادل أذكى." iconName="bulb-outline" count={counts.ideas} onPress={() => onOpenShelf('notes')} />

      <AppCard>
        <AppText weight="semibold">إجراءات سريعة</AppText>
        <View style={styles.actions}>
          <AppButton label="اكتب نوت" variant="ghost" onPress={onQuickNote} />
          <AppButton label="سجل صوت" variant="ghost" onPress={onQuickAudio} />
          <AppButton label="صوّر حاجة" variant="ghost" onPress={onQuickCamera} />
          <AppButton label="مسودة عنصر" variant="ghost" onPress={onQuickDraft} />
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.sm }, actions: { gap: spacing.xs, marginTop: spacing.xs } });
