import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';

type ItemVideoDiscoveryRailProps = {
  title: string;
  eyebrow?: string;
  description: string;
  moments: ItemVideoDiscoveryMoment[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ItemVideoDiscoveryRail({ title, eyebrow, description, moments, loading, errorMessage, onRetry }: ItemVideoDiscoveryRailProps) {
  if (!loading && !errorMessage && moments.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextBox}>
          {eyebrow ? <AppText style={styles.eyebrow}>{eyebrow}</AppText> : null}
          <AppText weight="bold" style={styles.title}>{title}</AppText>
          <AppText muted>{description}</AppText>
        </View>
        <View style={styles.videoIconShell}>
          <Ionicons name="videocam-outline" size={18} color={colors.primary} />
        </View>
      </View>

      {loading ? (
        <View style={styles.inlineState}>
          <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
          <AppText muted>نجهّز اللمحات المرئية...</AppText>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.inlineState}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.primary} />
          <AppText muted style={styles.errorText}>{errorMessage}</AppText>
          {onRetry ? <AppButton label="إعادة المحاولة" variant="neutral" onPress={onRetry} /> : null}
        </View>
      ) : null}

      {moments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {moments.map((moment) => {
            const durationLabel = formatDuration(moment.videoDurationMs);
            const metaLine = [moment.category, moment.location].filter(Boolean).join(' • ');

            return (
              <Pressable key={`${moment.id}-${moment.videoCreatedAt ?? 'video'}`} style={styles.card} onPress={() => router.push(`/item/${moment.id}`)}>
                {moment.imageUrl ? (
                  <View style={styles.coverWrap}>
                    <ExpoImage source={{ uri: moment.imageUrl }} style={styles.coverImage} contentFit="cover" />
                    <LinearGradient colors={['rgba(16, 22, 30, 0)', 'rgba(16, 22, 30, 0.72)']} style={styles.coverOverlay}>
                    <View style={styles.topRow}>
                      <View style={styles.videoPill}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                        <AppText style={styles.videoPillText}>لمحة فيديو</AppText>
                      </View>
                      {durationLabel ? (
                        <View style={styles.durationPill}>
                          <Ionicons name="time-outline" size={12} color="#FFFFFF" />
                          <AppText style={styles.durationText}>{durationLabel}</AppText>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.bottomMeta}>
                      <AppText numberOfLines={2} weight="bold" style={styles.cardTitle}>{moment.title}</AppText>
                      {metaLine ? <AppText numberOfLines={1} style={styles.cardMeta}>{metaLine}</AppText> : null}
                      <AppText style={styles.openText}>افتح العنصر</AppText>
                    </View>
                    </LinearGradient>
                  </View>
                ) : (
                  <LinearGradient colors={['#FFE9CA', '#F4D2A7', 'rgba(62,124,115,0.35)']} style={styles.fallbackWrap}>
                    <View style={styles.topRow}>
                      <View style={styles.videoPillDark}>
                        <Ionicons name="play" size={12} color={colors.text} />
                        <AppText style={styles.videoPillDarkText}>لمحة فيديو</AppText>
                      </View>
                      {durationLabel ? (
                        <View style={styles.durationPillSoft}>
                          <Ionicons name="time-outline" size={12} color={colors.text} />
                          <AppText style={styles.durationSoftText}>{durationLabel}</AppText>
                        </View>
                      ) : null}
                    </View>
                    <Ionicons name="videocam-outline" size={24} color={colors.primary} />
                    <AppText numberOfLines={2} weight="bold" style={styles.fallbackTitle}>{moment.title}</AppText>
                    {metaLine ? <AppText numberOfLines={1} muted>{metaLine}</AppText> : null}
                    <AppText style={styles.openSoftText}>افتح العنصر</AppText>
                  </LinearGradient>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerTextBox: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.accent, fontSize: 12 },
  title: { fontSize: 20 },
  videoIconShell: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,98,63,0.12)' },
  inlineState: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  errorText: { flex: 1 },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: { width: 240, height: 188, borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)' },
  coverWrap: { flex: 1 },
  coverImage: { ...StyleSheet.absoluteFillObject },
  coverOverlay: { flex: 1, padding: spacing.sm, justifyContent: 'space-between' },
  fallbackWrap: { flex: 1, padding: spacing.sm, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  videoPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(16,22,30,0.56)' },
  videoPillText: { color: '#FFFFFF', fontSize: 12 },
  durationPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(16,22,30,0.56)' },
  durationText: { color: '#FFFFFF', fontSize: 12 },
  bottomMeta: { gap: 4 },
  cardTitle: { color: '#FFFFFF', fontSize: 16 },
  cardMeta: { color: 'rgba(255,255,255,0.88)', fontSize: 12 },
  openText: { color: '#FFFFFF', fontSize: 12 },
  videoPillDark: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.78)' },
  videoPillDarkText: { fontSize: 12 },
  durationPillSoft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.75)' },
  durationSoftText: { fontSize: 12 },
  fallbackTitle: { fontSize: 16 },
  openSoftText: { color: colors.primary, fontSize: 12 },
});
