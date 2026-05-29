import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { getNotificationPermissionSnapshot, requestAndRegisterPushDevice, type PushPermissionSnapshot } from '@/lib/push-notifications';
import { showToast } from '@/lib/toast';

function getStatusCopy(snapshot: PushPermissionSnapshot | null) {
  if (!snapshot) return 'جاري قراءة حالة الإشعارات...';
  if (snapshot.status === 'unsupported') return 'الإشعارات غير متاحة على هذا الجهاز حالياً.';
  if (snapshot.granted && snapshot.hasStoredToken) return 'الإشعارات مفعلة والجهاز مسجل لاستقبال تنبيهات تِسوى.';
  if (snapshot.granted) return 'الإذن مفعّل. اضغط تفعيل الإشعارات لتسجيل هذا الجهاز.';
  if (snapshot.canAskAgain) return 'الإشعارات غير مفعلة. لن نطلب الإذن إلا بعد ضغطك على زر التفعيل.';
  return 'الإشعارات مرفوضة من إعدادات الجهاز. فعّلها من إعدادات النظام.';
}

export function NotificationPermissionCard() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<PushPermissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshSnapshot = async () => {
    try {
      setSnapshot(await getNotificationPermissionSnapshot());
    } catch {
      showToast({ title: 'تعذر قراءة حالة الإشعارات حالياً.' });
    }
  };

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  const enableNotifications = async () => {
    if (!user?.id) {
      showToast({ title: 'سجّل الدخول الأول لتفعيل الإشعارات.' });
      return;
    }

    if (snapshot?.status === 'unsupported') {
      showToast({ title: 'الإشعارات غير متاحة على هذا الجهاز حالياً.' });
      return;
    }

    if (snapshot && !snapshot.granted && !snapshot.canAskAgain) {
      showToast({ title: 'فعّل الإشعارات من إعدادات الجهاز.' });
      void Linking.openSettings().catch(() => undefined);
      return;
    }

    setBusy(true);
    try {
      const result = await requestAndRegisterPushDevice(user.id);
      await refreshSnapshot();
      if (result.ok) showToast({ title: 'تم تفعيل إشعارات تِسوى.' });
      else if (result.reason === 'permission_denied') showToast({ title: 'الإذن بالإشعارات غير مفعّل.' });
      else showToast({ title: 'تعذر تفعيل الإشعارات حالياً.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <AppText weight="semibold">حالة الإشعارات</AppText>
      <AppText muted>{getStatusCopy(snapshot)}</AppText>
      <View style={styles.actions}>
        <AppButton
          label={busy ? 'جاري التفعيل...' : 'تفعيل الإشعارات'}
          disabled={busy || snapshot?.status === 'unsupported'}
          onPress={() => { void enableNotifications(); }}
        />
        <AppButton
          label="تحديث الحالة"
          variant="neutral"
          onPress={() => { void refreshSnapshot(); }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
