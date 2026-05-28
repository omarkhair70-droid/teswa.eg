import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { checkIsAdminUser } from '@/lib/admin';

export default function SettingsScreen() {
  const [showAdminReports, setShowAdminReports] = useState(false);

  useEffect(() => {
    let mounted = true;

    void checkIsAdminUser().then((result) => {
      if (!mounted) return;
      setShowAdminReports(result.ok && result.isAdmin);
    }).catch(() => {
      if (mounted) setShowAdminReports(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppScreen>
      <View style={styles.root}>
        <AppText weight="bold" style={styles.title}>الإعدادات</AppText>

        {showAdminReports ? (
          <Pressable onPress={() => router.push('/admin/reports')}>
            <AppCard>
              <AppText weight="semibold">لوحة البلاغات</AppText>
              <AppText muted>مراجعة بلاغات الثقة والسلامة لفريق الإدارة.</AppText>
            </AppCard>
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.push('/settings/direct-privacy')}>
          <AppCard>
            <AppText weight="semibold">خصوصية الرسائل</AppText>
            <AppText muted>تحكم مين يقدر يبعتلك طلب مراسلة.</AppText>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => router.push('/settings/notifications')}>
          <AppCard>
            <AppText weight="semibold">إعدادات الإشعارات</AppText>
            <AppText muted>تحكم في أنواع التنبيهات اللي توصلك من التطبيق.</AppText>
          </AppCard>
        </Pressable>

        <AppCard>
          <AppText weight="semibold">إشعارات الرسائل</AppText>
          <AppText muted>استقبل تنبيه لما توصلك رسالة مباشرة.</AppText>
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  title: { fontSize: 22, marginBottom: spacing.xs },
});
