import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchBlockedUsers, type BlockedUserSummary, unblockUserFromMobile } from '@/lib/user-blocks';

function formatBlockedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function BlockedUsersScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<BlockedUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchBlockedUsers(user.id);
    if (!result.ok) {
      setUsers([]);
      setError(result.message);
    } else {
      setUsers(result.users);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (target: BlockedUserSummary) => {
    if (!user?.id || busyId) return;
    setBusyId(target.id);
    setFeedback(null);
    setError(null);
    const result = await unblockUserFromMobile(user.id, target.id);
    if (!result.ok) {
      setError(result.message);
    } else {
      setUsers((prev) => prev.filter((item) => item.id !== target.id));
      setFeedback(`تم إلغاء حظر ${target.displayName ?? target.username ?? 'المستخدم'}.`);
    }
    setBusyId(null);
  };

  if (!user) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل الدخول عشان تراجع قائمة الحظر." /></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع للإعدادات" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>الخصوصية والأمان</AppText><AppText weight="bold" style={styles.title}>المستخدمون المحظورون</AppText><AppText muted style={styles.subtitle}>الحسابات هنا لا تقدر تبدأ تواصل جديد معاك. تقدر تفك الحظر في أي وقت.</AppText></View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}><Ionicons name="shield-outline" size={23} color={colors.primary} /></View>
        <View style={styles.summaryCopy}><AppText weight="bold" style={styles.summaryValue}>{loading ? '—' : users.length}</AppText><AppText muted style={styles.summaryLabel}>حساب في قائمة الحظر</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="تحديث قائمة الحظر" onPress={() => void load()} disabled={loading} style={styles.refreshButton}><Ionicons name="refresh-outline" size={18} color={colors.textMuted} /></Pressable>
      </View>

      {error ? <View style={styles.errorStrip}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}
      {feedback ? <View style={styles.successStrip}><Ionicons name="checkmark-circle-outline" size={18} color={colors.success} /><AppText style={styles.successText}>{feedback}</AppText></View> : null}

      {loading ? (
        <View style={styles.listPanel}>{[0, 1, 2].map((key) => <View key={key} style={styles.skeletonRow}><View style={styles.skeletonAvatar} /><View style={styles.skeletonCopy}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /></View></View>)}</View>
      ) : null}

      {!loading && !error && users.length === 0 ? (
        <View style={styles.emptyPanel}><View style={styles.emptyIcon}><Ionicons name="people-outline" size={27} color={colors.accent} /></View><AppText weight="bold" style={styles.emptyTitle}>قائمة الحظر فاضية</AppText><AppText muted style={styles.emptyText}>لو حظرت حساب من ملفه أو من المحادثة، هيظهر هنا عشان تقدر تديره بعدين.</AppText></View>
      ) : null}

      {!loading && users.length > 0 ? (
        <View style={styles.listPanel}>
          {users.map((blocked, index) => {
            const blockedAt = formatBlockedAt(blocked.blockedAt);
            const initial = (blocked.displayName ?? blocked.username ?? 'م').trim()[0]?.toUpperCase() ?? 'م';
            const busy = busyId === blocked.id;
            return (
              <View key={blocked.id} style={[styles.userRow, index === users.length - 1 && styles.userRowLast]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`فتح ملف ${blocked.displayName ?? blocked.username ?? 'المستخدم'}`} onPress={() => router.push(`/profile/${blocked.id}`)}>
                  {blocked.avatarUrl ? <Image source={{ uri: blocked.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarLetter}>{initial}</AppText></View>}
                </Pressable>
                <View style={styles.userCopy}>
                  <AppText weight="semibold" style={styles.userName}>{blocked.displayName ?? 'مستخدم تِسوى'}</AppText>
                  {blocked.username ? <AppText muted style={styles.username}>@{blocked.username}</AppText> : null}
                  {blockedAt ? <AppText muted style={styles.blockedAt}>محظور منذ {blockedAt}</AppText> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="إلغاء حظر المستخدم" disabled={Boolean(busyId)} onPress={() => void unblock(blocked)} style={[styles.unblockButton, busy && styles.disabled]}>
                  <AppText weight="semibold" style={styles.unblockText}>{busy ? '...' : 'إلغاء الحظر'}</AppText>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.note}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText muted style={styles.noteText}>إلغاء الحظر لا يعمل متابعة تلقائية ولا يعيد أي محادثة قديمة؛ هو فقط يسمح بالتفاعل من جديد حسب إعدادات الخصوصية الحالية.</AppText></View>
      {error ? <AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void load()} /> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'right' },
  subtitle: { fontSize: 13, lineHeight: 20, textAlign: 'right' },
  summaryCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryIcon: { width: 48, height: 48, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  summaryCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  summaryValue: { fontSize: 23 },
  summaryLabel: { fontSize: 12 },
  refreshButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  errorStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right' },
  successStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  successText: { flex: 1, color: colors.success, textAlign: 'right' },
  listPanel: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  userRow: { minHeight: 82, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  userRowLast: { borderBottomWidth: 0 },
  avatar: { width: 50, height: 50, borderRadius: radii.round },
  avatarFallback: { width: 50, height: 50, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  avatarLetter: { color: colors.primary, fontSize: 18 },
  userCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  userName: { fontSize: 15, textAlign: 'right' },
  username: { fontSize: 11 },
  blockedAt: { fontSize: 10 },
  unblockButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  unblockText: { fontSize: 11, color: colors.primary },
  emptyPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  note: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  noteText: { flex: 1, fontSize: 11, lineHeight: 18, textAlign: 'right' },
  skeletonRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  skeletonAvatar: { width: 50, height: 50, borderRadius: radii.round, backgroundColor: '#EEE7DF' },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTitle: { width: '42%', height: 13, alignSelf: 'flex-end', borderRadius: 7, backgroundColor: '#EEE7DF' },
  skeletonLine: { width: '65%', height: 10, alignSelf: 'flex-end', borderRadius: 5, backgroundColor: '#F3E7DB' },
  disabled: { opacity: 0.45 },
});
