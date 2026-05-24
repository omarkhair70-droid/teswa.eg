import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export type DolabSyncState = 'saved' | 'temporary' | 'saving' | 'failed' | 'synced';

const labels: Record<DolabSyncState, string> = {
  saved: 'محفوظ',
  temporary: 'مؤقت',
  saving: 'بيتحفظ...',
  failed: 'فشل الحفظ',
  synced: 'متزامن',
};

export function DolabSyncBadge({ state }: { state: DolabSyncState }) {
  return (
    <View style={[styles.badge, state === 'failed' ? styles.failed : null]}>
      <AppText style={styles.text}>{labels[state]}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    alignSelf: 'flex-start',
  },
  failed: {
    backgroundColor: colors.dangerSoft,
  },
  text: {
    fontSize: 11,
  },
});
