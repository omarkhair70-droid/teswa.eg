import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type Props = {
  title: string;
  subtitle?: string;
};

export function DolabAudioPlaceholderCard({ title, subtitle }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="mic-outline" size={18} color={colors.primary} />
      </View>
      <AppText weight="semibold" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText muted style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4EC',
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  title: { fontSize: 12 },
  subtitle: { fontSize: 11, maxWidth: 132 },
});
