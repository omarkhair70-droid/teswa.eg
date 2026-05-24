import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type SavedMediaCard = {
  id: string;
  mediaTypeLabel: string;
  storagePath: string;
  linkedItemTitle?: string;
  meta: string;
};

export function DolabSavedMediaGrid({ media }: { media: SavedMediaCard[] }) {
  if (media.length === 0) {
    return <AppText muted style={styles.empty}>مفيش ميديا محفوظة سحابيًا لسه.</AppText>;
  }

  return (
    <View style={styles.wrap}>
      {media.map((item) => (
        <View key={item.id} style={styles.card}>
          <AppText weight="semibold">{item.mediaTypeLabel}</AppText>
          <AppText muted style={styles.small}>محفوظ</AppText>
          <AppText muted style={styles.small} numberOfLines={1}>المسار: {item.storagePath}</AppText>
          {item.linkedItemTitle ? <AppText muted style={styles.small}>مرتبط: {item.linkedItemTitle}</AppText> : null}
          <AppText muted style={styles.small}>{item.meta}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#FFFEFC', gap: 2 },
  small: { fontSize: 12 },
  empty: { fontSize: 12 },
});
