import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { getNotificationPermissionSnapshot, requestAndRegisterPushDevice, type PushPermissionSnapshot } from '@/lib/push-notifications';
import { showToast } from '@/lib/toast';

type PermissionVisual = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  surface: string;
  color: string;
  actionLabel: string;
};

function getStatusCopy(snapshot: PushPermissionSnapshot | null): PermissionVisual {
  if (!snapshot) {
    return {
      label: 'بنقرأ حالة الجهاز',
      description: 'ثواني ونتأكد هل الجهاز جاهز يستقبل تنبيهات تِسوى.',
      icon: 'sync-outline',
      surface: colors.primarySoft,
      color: colors.primary,
      actionLabel: 'تفعيل الإشعارات',
    };
  }
  if (snapshot.status === 'unsupported') {
    return {
      label: 'غير متاحة على الجهاز',
      description: 'الجهاز أو البيئة الحالية لا تدعم Push Notifications.',
      icon: 'notifications-off-outline',
      surface: '#EEE7DF',
      color: colors.textMuted,
      actionLabel: 'غير متاح',
    };
  }
  if (snapshot.granted && snapshot.hasStoredToken) {
    return {
      label: 'جاهزة وتوصلك',
      description: 'الإذن مفعّل والجهاز مسجل لاستقبال تنبيهات تِسوى.',
      icon: 'checkmark-circle-outline',
      surface: colors.successSoft,
      color: colors.success,
      actionLabel: 'تحديث التسجيل',
    };
  }
  if (snapshot.granted) {
    return {
      label: 'الإذن موجود، التسجيل ناقص',
      description: 'النظام سامح بالإشعارات، لكن الجهاز محتاج يتسجل عند تِسوى.',
      icon: 'phone-portrait-outline',
      surface: colors.accentSoft,
      color: colors.accent,
      actionLabel: 'تسجيل الجهاز',
    };
  }
  if (snapshot.canAskAgain) {
    return {
      label: 'الإشعارات لسه مقفولة',
      description: 'مش هنطلب الإذن إلا لما تضغط تفعيل بنفسك.',
      icon: 'notifications-outline',
      surface: colors.primarySoft,
      color: colors.primary,
      actionLabel: 'تفعيل الإشعارات',
    };
  }
  return {
    label: 'مقفولة من إعدادات الجهاز',
    description: 'النظام منع طلب الإذن مرة تانية؛ افتح إعدادات الجهاز وفعّلها هناك.',
    icon: 'settings-outline',
    surface: colors.dangerSoft,
    color: colors.danger,
    actionLabel: 'فتح إعدادات الجهاز',
  };
}

export function NotificationPermissionCard() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<PushPermissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const visual = useMemo(() => getStatusCopy(snapshot), [snapshot]);

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
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: visual.surface }]}>
          <Ionicons name={visual.icon} size={22} color={visual.color} />
        </View>
        <View style={styles.copy}>
          <AppText muted style={styles.eyebrow}>حالة الجهاز</AppText>
          <AppText weight="bold" style={styles.title}>{visual.label}</AppText>
          <AppText muted style={styles.description}>{visual.description}</AppText>
        </View>
        {snapshot?.granted && snapshot.hasStoredToken ? <View style={styles.liveDot} /> : null}
      </View>

      <View style={styles.actions}>
        <AppButton
          label={busy ? 'جاري التنفيذ...' : visual.actionLabel}
          disabled={busy || snapshot?.status === 'unsupported'}
          onPress={() => { void enableNotifications(); }}
        />
        <AppButton
          label="إعادة فحص الحالة"
          variant="neutral"
          disabled={busy}
          onPress={() => { void refreshSnapshot(); }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontSize: 11,
  },
  title: {
    fontSize: 17,
    textAlign: 'right',
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: radii.round,
    backgroundColor: colors.success,
  },
  actions: {
    gap: spacing.xs,
  },
});
