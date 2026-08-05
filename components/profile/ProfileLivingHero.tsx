import { Ionicons } from '@expo/vector-icons';
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

type MetaPillProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function MetaPill({ icon, label }: MetaPillProps) {
  return (
    <View style={styles.metaPill}>
      <Ionicons name={icon} size={14} color="#815A48" />
      <AppText muted numberOfLines={1} style={styles.metaPillText}>{label}</AppText>
    </View>
  );
}

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
  const isSelf = variant === 'self';
  const initial = displayName.trim().charAt(0) || 'ت';
  const storyLabel = activeStoriesCount === 1 ? 'قصة نشطة الآن' : `${activeStoriesCount} قصص نشطة الآن`;

  return (
    <View style={[styles.shell, isSelf && styles.shellSelf]}>
      <View style={[styles.coverFrame, isSelf && styles.coverFrameSelf]}>
        {coverUrl ? (
          <ExpoImage
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={['#131110', '#241814', '#522A1E']}
            start={{ x: 0.08, y: 0.08 }}
            end={{ x: 0.94, y: 0.9 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <LinearGradient
          colors={coverUrl
            ? ['rgba(16,13,11,0.12)', 'rgba(18,13,11,0.4)', 'rgba(26,14,10,0.78)']
            : ['rgba(10,9,8,0.02)', 'rgba(16,12,10,0.16)', 'rgba(25,13,10,0.42)']}
          locations={[0, 0.56, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.orbTerracottaOuter} />
        <View style={styles.orbTerracottaInner} />
        <View style={styles.orbForest} />
        <View style={styles.orbEarth} />
        <View style={styles.sparkOne} />
        <View style={styles.sparkTwo} />

        <View style={styles.identityBadge}>
          <Ionicons name="sparkles-outline" size={15} color="#FFF8F2" />
          <AppText weight="semibold" style={styles.identityBadgeText}>
            {isSelf ? 'هويتك في تِسوى' : 'ملف يعيش داخل تِسوى'}
          </AppText>
        </View>
      </View>

      <View style={[styles.identityPanel, isSelf && styles.identityPanelSelf]}>
        <View style={styles.avatarColumn}>
          <Pressable
            disabled={!onPressAvatarRing}
            onPress={onPressAvatarRing ?? undefined}
            accessibilityRole={onPressAvatarRing ? 'button' : undefined}
            accessibilityLabel={hasStories ? `عرض ${storyLabel}` : undefined}
            style={[
              styles.avatarAura,
              isSelf && styles.avatarAuraSelf,
              hasStories && styles.avatarAuraActive,
            ]}
          >
            <Pressable
              disabled={!onPressAvatar}
              onPress={onPressAvatar ?? undefined}
              accessibilityRole={onPressAvatar ? 'button' : undefined}
              accessibilityLabel={onPressAvatar ? 'فتح خيارات صورة الملف' : undefined}
              style={[styles.avatarFrame, isSelf && styles.avatarFrameSelf]}
            >
              {avatarUrl ? (
                <ExpoImage
                  source={{ uri: avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={220}
                  cachePolicy="memory-disk"
                />
              ) : (
                <LinearGradient
                  colors={['#EED8CB', '#FFF4DC']}
                  style={[styles.avatar, styles.avatarFallback]}
                >
                  <AppText weight="bold" style={styles.avatarInitial}>{initial}</AppText>
                </LinearGradient>
              )}
            </Pressable>
          </Pressable>
          {hasStories ? <View style={styles.liveDot} /> : null}
        </View>

        <View style={[styles.info, isSelf && styles.infoSelf]}>
          <AppText
            weight="bold"
            numberOfLines={2}
            style={[styles.name, isSelf && styles.nameSelf]}
          >
            {displayName}
          </AppText>

          {username ? (
            <AppText muted numberOfLines={1} style={styles.username}>@{username}</AppText>
          ) : null}

          {tagline ? (
            <AppText numberOfLines={3} style={styles.tagline}>{tagline}</AppText>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.metaRow}>
            {location ? <MetaPill icon="location-outline" label={location} /> : null}
            {memberSince ? <MetaPill icon="calendar-outline" label={`عضو منذ ${memberSince}`} /> : null}
          </View>

          {hasStories ? (
            <View style={styles.storyRow}>
              <View style={styles.livePill}>
                <View style={styles.liveSpark} />
                <AppText weight="semibold" style={styles.livePillText}>{storyLabel}</AppText>
              </View>
              {onOpenStories ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="عرض القصص"
                  onPress={onOpenStories}
                  style={({ pressed }) => [styles.storyCta, pressed && styles.storyCtaPressed]}
                >
                  <AppText weight="semibold" style={styles.storyCtaText}>عرض القصص</AppText>
                  <Ionicons name="arrow-back-outline" size={14} color={colors.primary} />
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
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: 'rgba(255,253,248,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    ...shadows.card,
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  shellSelf: { borderRadius: 30 },
  coverFrame: { height: 220, overflow: 'hidden', backgroundColor: '#241814' },
  coverFrameSelf: { height: 148 },
  orbTerracottaOuter: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    right: -54, top: -82, backgroundColor: 'rgba(195,89,55,0.72)',
  },
  orbTerracottaInner: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    right: -22, top: -54, backgroundColor: 'rgba(121,55,39,0.5)',
  },
  orbForest: {
    position: 'absolute', width: 172, height: 172, borderRadius: 86,
    left: -62, bottom: -74, backgroundColor: 'rgba(46,91,84,0.36)',
  },
  orbEarth: {
    position: 'absolute', width: 136, height: 136, borderRadius: 68,
    right: 112, bottom: -78, backgroundColor: 'rgba(102,65,50,0.34)',
  },
  sparkOne: {
    position: 'absolute', width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#E88C5E', right: 112, top: 54,
  },
  sparkTwo: {
    position: 'absolute', width: 3, height: 3, borderRadius: 2,
    backgroundColor: '#F3C29B', left: 132, top: 44,
  },
  identityBadge: {
    position: 'absolute', left: spacing.md, bottom: spacing.md, minHeight: 34,
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs,
    borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: 'rgba(20,17,15,0.54)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  identityBadgeText: { color: '#FFF8F2', fontSize: 12 },
  identityPanel: {
    flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, marginTop: -54,
  },
  identityPanelSelf: { marginTop: -45, paddingBottom: spacing.md },
  avatarColumn: { alignItems: 'center' },
  avatarAura: {
    borderRadius: 62, padding: 5, backgroundColor: 'rgba(255,253,248,0.98)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', shadowColor: '#241711',
    shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  avatarAuraSelf: { padding: 4 },
  avatarAuraActive: {
    borderColor: 'rgba(242,169,83,0.98)', backgroundColor: 'rgba(255,246,225,0.99)',
  },
  avatarFrame: {
    width: 104, height: 104, borderRadius: 52, overflow: 'hidden',
    backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.surface,
  },
  avatarFrameSelf: { width: 88, height: 88, borderRadius: 44 },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: colors.primary, fontSize: 34 },
  liveDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#F59E0B',
    borderWidth: 3, borderColor: colors.surface, marginTop: -18, marginRight: 56,
  },
  info: { flex: 1, minWidth: 0, paddingTop: 70, gap: spacing.xs },
  infoSelf: { paddingTop: 54 },
  name: { color: colors.text, fontSize: 27, lineHeight: 34, letterSpacing: -0.3 },
  nameSelf: { fontSize: 24, lineHeight: 31 },
  username: { fontSize: 14, lineHeight: 20 },
  tagline: { color: colors.text, fontSize: 13, lineHeight: 21, marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(184,98,63,0.17)',
    marginVertical: spacing.sm,
  },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  metaPill: {
    maxWidth: '100%', minHeight: 34, flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    overflow: 'hidden', borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.08)',
    borderWidth: 1, borderColor: 'rgba(184,98,63,0.08)', paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  metaPillText: { flexShrink: 1, fontSize: 11 },
  storyRow: {
    flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm,
    marginTop: spacing.sm, alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs,
    borderRadius: radii.round, backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.24)',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  liveSpark: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
  livePillText: { color: '#7A3F12', fontSize: 11 },
  storyCta: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    backgroundColor: 'rgba(184,98,63,0.09)',
  },
  storyCtaPressed: { opacity: 0.72 },
  storyCtaText: { color: colors.primary, fontSize: 11 },
});
