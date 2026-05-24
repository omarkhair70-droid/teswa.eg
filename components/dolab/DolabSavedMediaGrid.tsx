import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { DolabSavedMediaPreviewCard, type DolabSavedMediaCardModel } from '@/components/dolab/DolabSavedMediaPreviewCard';

export function DolabSavedMediaGrid({ media }: { media: DolabSavedMediaCardModel[] }) {
  if (media.length === 0) {
    return <AppText muted style={styles.empty}>مفيش ميديا محفوظة سحابيًا لسه.</AppText>;
  }

  return (
    <View style={styles.wrap}>
      {media.map((item) => (
        <DolabSavedMediaPreviewCard key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  empty: { fontSize: 12 },
});
