import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function ReportSuccessScreen({ onBack, backLabel = 'الرجوع' }: { onBack: () => void; backLabel?: string }) {
  return (
    <AppScreen backgroundVariant="alive">
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }}>
        <View style={{ width: 64, height: 64, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSoft }}>
          <Ionicons name="shield-checkmark" size={30} color={colors.success} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText muted style={{ fontSize: 12 }}>البلاغ وصل للمراجعة</AppText>
          <AppText weight="bold" style={{ fontSize: 28, lineHeight: 36 }}>شكراً إنك ساعدت تحافظ على تِسوى آمنة</AppText>
          <AppText muted style={{ lineHeight: 23 }}>هنراجع السياق والمعلومات اللي بعتها. لو حصل إجراء مرتبط بالبلاغ، هتلاقي تحديث داخل إشعارات تِسوى.</AppText>
        </View>
        <View style={{ padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft, flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' }}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
          <AppText muted style={{ flex: 1, lineHeight: 20 }}>هوية مُرسل البلاغ مش بتظهر للطرف المُبلّغ عنه.</AppText>
        </View>
        <AppButton label={backLabel} onPress={onBack} />
      </View>
    </AppScreen>
  );
}
