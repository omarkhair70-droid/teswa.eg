import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { AppInfoRow } from '@/components/ui/AppInfoRow';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

function readExtraValue(key: string) {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function SettingsStatusCard() {
  const appVersion = Constants.expoConfig?.version || 'غير متاح';
  const runtimeVersion = typeof Constants.expoConfig?.runtimeVersion === 'string' ? Constants.expoConfig.runtimeVersion : 'حسب نسخة التطبيق';
  const channel = readExtraValue('easChannel') || 'production';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText weight="semibold">معلومات التطبيق</AppText>
        <AppText muted style={styles.description}>تفاصيل مفيدة للدعم والتحديثات، بنفس شكل عناصر النظام الجديدة.</AppText>
      </View>
      <AppInfoRow label="الإصدار" value={appVersion} description="نسخة التطبيق الحالية." />
      <AppInfoRow label="Runtime" value={runtimeVersion} description="نطاق توافق تحديثات OTA." />
      <AppInfoRow label="القناة" value={channel} description="قناة التحديثات المستخدمة حالياً." />
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
});
