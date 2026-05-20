import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';

type ProfileLivingHeroProps = {
  coverUrl: string | null;
  avatarUrl: string | null;
  displayName: string;
  username?: string | null;
  tagline?: string | null;
  location?: string | null;
  memberSince?: string | null;
  activeStoriesCount?: number;
  onOpenStories?: (() => void) | null;
  onPressAvatar?: (() => void) | null;
  onPressAvatarRing?: (() => void) | null;
  variant?: 'self' | 'public';
};

export function ProfileLivingHero({
  coverUrl,
  avatarUrl,
  displayName,
  username,
  tagline,
  location,
  memberSince,
  activeStoriesCount = 0,
  onOpenStories,
  onPressAvatar,
  onPressAvatarRing,
  variant = 'public',
}: ProfileLivingHeroProps) {
  const hasStories = activeStoriesCount > 0;
  const initial = displayName.trim().charAt(0) || 'ت';
  const storyLabel = activeStoriesCount === 1 ? 'قصة نشطة الآن' : `${activeStoriesCount} قصص نشطة الآن`;

  return (
    <View style={styles.shell}>
      <View style={styles.coverFrame}>
        {coverUrl ? (
          <ExpoImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="memory-disk" />
        ) : (
          <LinearGradient
            colors={['#2A1A15', '#8E4B32', '#E7B98F']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['rgba(29,26,22,0.12)', 'rgba(29,26,22,0.42)', 'rgba(44,24,17,0.82)']}
          locations={[0, 0.48, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />
        <View style={styles.heroCopy}>
          <AppText style={styles.eyebrow}>{variant === 'self' ? 'هويتك في تِسوى' : 'ملف يعيش داخل تِسوى'}</AppText>
          {hasStories ? <AppText style={styles.storyText}>{storyLabel}</AppText> : null}
        </View>
      </View>

      <View style={styles.identityPanel}>
        <View style={styles.avatarColumn}>
          <Pressable disabled={!onPressAvatarRing} onPress={onPressAvatarRing ?? undefined} style={[styles.avatarAura, hasStories && styles.avatarAuraActive]}>
            <Pressable disabled={!onPressAvatar} onPress={onPressAvatar ?? undefined} style={styles.avatarFrame}>
              {avatarUrl ? (
                <ExpoImage source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" transition={220} cachePolicy="memory-disk" />
              ) : (
                <LinearGradient colors={[colors.primarySoft, '#FFF4DC']} style={[styles.avatar, styles.avatarFallback]}>
                  <AppText weight="bold" style={styles.avatarInitial}>{initial}</AppText>
                </LinearGradient>
              )}
            </Pressable>
          </Pressable>
          {hasStories ? <View style={styles.liveDot} /> : null}
        </View>

        <View style={styles.info}>
          <AppText weight="bold" style={styles.name}>{displayName}</AppText>
          {username ? <AppText muted style={styles.meta}>@{username}</AppText> : null}
          {tagline ? <AppText style={styles.tagline}>{tagline}</AppText> : null}
          <View style={styles.metaRow}>
            {location ? <AppText muted style={styles.metaPill}>{location}</AppText> : null}
            {memberSince ? <AppText muted style={styles.metaPill}>عضو منذ {memberSince}</AppText> : null}
          </View>
          {hasStories ? (
            <View style={styles.storyRow}>
              <View style={styles.livePill}>
                <View style={styles.liveSpark} />
                <AppText weight="semibold" style={styles.livePillText}>{storyLabel}</AppText>
              </View>
              {onOpenStories ? (
                <Pressable onPress={onOpenStories} style={styles.storyCta}>
                  <AppText weight="semibold" style={styles.storyCtaText}>عرض القصص</AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,253,248,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    ...shadows.card,
  },
  coverFrame: {
    height: 218,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  glowOne: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,214,155,0.22)',
    top: -58,
    right: -42,
  },
  glowTwo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(62,124,115,0.18)',
    bottom: -44,
    left: -28,
  },
  heroCopy: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { color: 'rgba(255,253,248,0.86)', fontSize: 13 },
  storyText: { color: colors.white, fontSize: 15 },
  identityPanel: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    marginTop: -38,
  },
  avatarColumn: { alignItems: 'center' },
  avatarAura: {
    borderRadius: 54,
    padding: 4,
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  avatarAuraActive: {
    borderColor: 'rgba(255,190,112,0.98)',
    backgroundColor: 'rgba(255,244,220,0.96)',
  },
  avatarFrame: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: colors.primary, fontSize: 34 },
  liveDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: colors.surface,
    marginTop: -16,
    marginRight: 52,
  },
  info: { flex: 1, paddingTop: 46, gap: spacing.xs },
  name: { fontSize: 25, lineHeight: 32 },
  meta: { fontSize: 14 },
  tagline: { color: colors.text, lineHeight: 22 },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  metaPill: {
    overflow: 'hidden',
    borderRadius: radii.round,
    backgroundColor: 'rgba(184,98,63,0.09)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
  },
  storyRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  livePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    backgroundColor: 'rgba(245,158,11,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.26)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveSpark: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
  livePillText: { color: '#7A3F12', fontSize: 12 },
  storyCta: {
    borderRadius: radii.round,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  storyCtaText: { color: colors.white, fontSize: 12 },
});
