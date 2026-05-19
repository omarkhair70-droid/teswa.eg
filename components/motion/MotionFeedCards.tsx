import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/constants/colors";
import { radii } from "@/constants/radii";
import { spacing } from "@/constants/spacing";
import { MovingItemInterest } from "@/lib/motion-interest";
import { StoryDiscoveryItem } from "@/lib/story-discovery";

type MotionMovingItemCardProps = {
  item: MovingItemInterest;
  onPress: () => void;
};

type MotionStoryItemCardProps = {
  item: StoryDiscoveryItem;
  onPress: () => void;
};

type FeedMetaPill = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const compactValues = (values: Array<string | null | undefined>) =>
  values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

function FeedImage({
  imageUrl,
  variant,
}: {
  imageUrl: string | null;
  variant: "motion" | "story";
}) {
  return (
    <View
      style={[styles.imageFrame, variant === "story" && styles.storyImageFrame]}
    >
      {imageUrl ? (
        <ExpoImage
          source={{ uri: imageUrl }}
          style={styles.feedImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={140}
        />
      ) : (
        <LinearGradient
          colors={
            variant === "motion"
              ? ["#F6E2D0", "#C9784E"]
              : ["#F7E8D9", "#3E7C73"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.imagePlaceholder}
        >
          <Ionicons
            name={variant === "motion" ? "pulse-outline" : "book-outline"}
            size={28}
            color="rgba(255,255,255,0.9)"
          />
          <AppText style={styles.placeholderText}>بدون صورة</AppText>
        </LinearGradient>
      )}
      <LinearGradient
        colors={[
          "rgba(29,26,22,0.02)",
          "rgba(29,26,22,0.2)",
          "rgba(29,26,22,0.68)",
        ]}
        locations={[0.25, 0.58, 1]}
        style={styles.imageShade}
      />
      <View style={styles.imageGlow} />
    </View>
  );
}

function MicroLabel({
  label,
  icon,
  tone = "motion",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "motion" | "story";
}) {
  return (
    <View style={[styles.microPill, tone === "story" && styles.storyMicroPill]}>
      <Ionicons
        name={icon}
        size={13}
        color={tone === "story" ? colors.accent : colors.primary}
      />
      <AppText
        weight="semibold"
        style={[styles.microText, tone === "story" && styles.storyMicroText]}
      >
        {label}
      </AppText>
    </View>
  );
}

function MetaPills({
  pills,
  tone = "motion",
}: {
  pills: FeedMetaPill[];
  tone?: "motion" | "story";
}) {
  if (!pills.length) return null;

  return (
    <View style={styles.metaWrap}>
      {pills.map((pill) => (
        <View
          key={`${pill.icon}-${pill.label}`}
          style={[styles.metaPill, tone === "story" && styles.storyMetaPill]}
        >
          <Ionicons
            name={pill.icon}
            size={12}
            color={tone === "story" ? colors.accent : colors.primary}
          />
          <AppText numberOfLines={1} style={styles.metaText}>
            {pill.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function OwnerLine({
  ownerDisplayName,
  tone = "motion",
}: {
  ownerDisplayName: string | null;
  tone?: "motion" | "story";
}) {
  const owner = ownerDisplayName?.trim();
  if (!owner) return null;

  return (
    <View style={styles.ownerRow}>
      <Ionicons
        name="person-circle-outline"
        size={15}
        color={tone === "story" ? colors.accent : colors.primary}
      />
      <AppText muted numberOfLines={1} style={styles.ownerText}>
        من مساحة {owner}
      </AppText>
    </View>
  );
}

export function MotionMovingItemCard({
  item,
  onPress,
}: MotionMovingItemCardProps) {
  const interestBadge =
    item.openInterestCount === 1
      ? "وصلها اقتراح"
      : `وصلها ${item.openInterestCount} اقتراحات مفتوحة`;
  const metaPills: FeedMetaPill[] = [
    ...compactValues([item.category]).map((label) => ({
      label,
      icon: "pricetag-outline" as const,
    })),
    ...compactValues([item.condition]).map((label) => ({
      label,
      icon: "shield-checkmark-outline" as const,
    })),
    ...compactValues([item.location]).map((label) => ({
      label,
      icon: "location-outline" as const,
    })),
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardPressable,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <LinearGradient
        colors={["#FFFDF8", "#F7E7D9", "#FFF8EF"]}
        start={{ x: 0.03, y: 0.02 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardSurface}
      >
        <View style={styles.cardAura} />
        <FeedImage imageUrl={item.imageUrl} variant="motion" />
        <View style={styles.contentWrap}>
          <View style={styles.topRow}>
            <MicroLabel label="باب بيتحرك" icon="swap-horizontal" />
            <View style={styles.interestBadge}>
              <Ionicons name="pulse-outline" size={13} color={colors.white} />
              <AppText weight="semibold" style={styles.interestText}>
                {interestBadge}
              </AppText>
            </View>
          </View>
          <AppText weight="bold" numberOfLines={2} style={styles.title}>
            {item.title}
          </AppText>
          <MetaPills pills={metaPills} />
          <OwnerLine ownerDisplayName={item.ownerDisplayName} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export function MotionStoryItemCard({
  item,
  onPress,
}: MotionStoryItemCardProps) {
  const locationLabel = compactValues([item.city, item.area]).join(" · ");
  const metaPills: FeedMetaPill[] = [
    ...compactValues([item.category]).map((label) => ({
      label,
      icon: "pricetag-outline" as const,
    })),
    ...compactValues([locationLabel]).map((label) => ({
      label,
      icon: "location-outline" as const,
    })),
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardPressable,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <LinearGradient
        colors={["#FFFDF8", "#F4EDE1", "#F8E3D1"]}
        start={{ x: 0.06, y: 0.02 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardSurface, styles.storySurface]}
      >
        <View style={[styles.cardAura, styles.storyAura]} />
        <FeedImage imageUrl={item.imageUrl} variant="story" />
        <View style={styles.contentWrap}>
          <View style={styles.topRow}>
            <MicroLabel
              label="حكاية ظاهرة"
              icon="sparkles-outline"
              tone="story"
            />
            <View style={styles.storyLabelPill}>
              <Ionicons name="book-outline" size={13} color={colors.accent} />
              <AppText weight="semibold" style={styles.storyLabelText}>
                {item.storyLabel}
              </AppText>
            </View>
          </View>
          <AppText weight="bold" numberOfLines={2} style={styles.title}>
            {item.title}
          </AppText>
          <View style={styles.snippetBox}>
            <View style={styles.quoteMark} />
            <AppText numberOfLines={3} style={styles.snippetText}>
              {item.storySnippet}
            </AppText>
          </View>
          <MetaPills pills={metaPills} tone="story" />
          <OwnerLine ownerDisplayName={item.ownerDisplayName} tone="story" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardPressable: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.988 }] },
  cardSurface: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(184,98,63,0.22)",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  storySurface: { borderColor: "rgba(62,124,115,0.18)" },
  cardAura: {
    position: "absolute",
    right: -34,
    top: -48,
    width: 140,
    height: 140,
    borderRadius: radii.round,
    backgroundColor: "rgba(217,149,99,0.16)",
  },
  storyAura: { backgroundColor: "rgba(62,124,115,0.12)" },
  imageFrame: {
    height: 190,
    margin: spacing.sm,
    marginBottom: 0,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: colors.primarySoft,
  },
  storyImageFrame: { height: 176 },
  feedImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.primarySoft,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  placeholderText: { color: "rgba(255,255,255,0.92)", fontSize: 12 },
  imageShade: { ...StyleSheet.absoluteFillObject },
  imageGlow: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.46)",
  },
  contentWrap: { padding: spacing.md, gap: spacing.sm },
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  microPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(184,98,63,0.1)",
    borderWidth: 1,
    borderColor: "rgba(184,98,63,0.18)",
  },
  storyMicroPill: {
    backgroundColor: "rgba(62,124,115,0.1)",
    borderColor: "rgba(62,124,115,0.18)",
  },
  microText: { color: colors.primary, fontSize: 12 },
  storyMicroText: { color: colors.accent },
  interestBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  interestText: { color: colors.white, fontSize: 12 },
  storyLabelPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderWidth: 1,
    borderColor: "rgba(62,124,115,0.18)",
  },
  storyLabelText: { color: colors.accent, fontSize: 12 },
  title: { fontSize: 18, lineHeight: 26, color: colors.text },
  metaWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  metaPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    maxWidth: "100%",
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: "rgba(255,253,248,0.78)",
    borderWidth: 1,
    borderColor: "rgba(184,98,63,0.14)",
  },
  storyMetaPill: { borderColor: "rgba(62,124,115,0.14)" },
  metaText: { color: colors.textMuted, fontSize: 12 },
  ownerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  ownerText: { flex: 1, fontSize: 12 },
  snippetBox: {
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: "rgba(255,253,248,0.72)",
    borderWidth: 1,
    borderColor: "rgba(221,208,197,0.72)",
    gap: spacing.xs,
  },
  quoteMark: {
    width: 34,
    height: 3,
    borderRadius: radii.round,
    backgroundColor: "rgba(62,124,115,0.34)",
    alignSelf: "flex-end",
  },
  snippetText: { color: colors.text, lineHeight: 22 },
});
