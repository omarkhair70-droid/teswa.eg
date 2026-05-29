import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type StatusRowProps = {
  label: string;
  value: string;
};

function readExtraValue(key: string) {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function StatusRow({ label, value }: StatusRowProps) {
  return (
    <View style={styles.row}>
      <AppText muted style={styles.label}>{label}</AppText>
      <AppText weight="semibold" style={styles.value} numberOfLines={1}>{value}</AppText>
    </View>
  );
}

export function SettingsStatusCard() {
  const appVersion = Constants.expoConfig?.version || 'غير متاح';
  const runtimeVersion = typeof Constants.expoConfig?.runtimeVersion === 'string' ? Constants.expoConfig.runtimeVersion : 'حسب نسخة التطبيق';
  const channel = readExtraValue('easChannel') || 'production';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText weight="semibold">معلومات التطبيق</AppText>
        <AppText muted style={styles.description}>تفاصيل مفيدة للدعم والتحديثات.</AppText>
      </View>
      <StatusRow label="الإصدار" value={appVersion} />
      <StatusRow label="Runtime" value={runtimeVersion} />
      <StatusRow label="القناة" value={channel} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  header: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    fontSize: 13,
  },
  value: {
    flex: 1,
    textAlign: 'left',
    fontSize: 13,
  },
});
