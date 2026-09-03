import { useEffect, useRef, useState } from 'react';
import {
import { ABSOLUTE_FILL } from '@/lib/styles/absolute-fill';
  AccessibilityInfo,
  Animated,
  LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/lib/auth';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.teswa.mobile';
const MOVEMENT_SCREEN = 'https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/10-movement.webp';

type SectionKey = 'value' | 'product' | 'swap';

const NAV_LINKS: { label: string; target: SectionKey }[] = [
  { label: 'الفكرة', target: 'value' },
  { label: 'المنتج', target: 'product' },
  { label: 'التبديل', target: 'swap' },
];

const productScreens = [
  {
    key: 'discover',
    eyebrow: 'اكتشاف',
    title: 'العالم بيتحرّك حواليك',
    body: 'اكتشاف، قصص، إشارات محلية، وحاجات ممكن تكون بداية لتبديلة.',
    image: 'https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/01-discovery-hub.webp',
  },
  {
    key: 'marketplace',
    eyebrow: 'اختيار',
    title: 'شوف الحاجة قبل ما تحكم عليها',
    body: 'Marketplace حقيقي، مش فورم إعلانات. الصورة والحالة والمكان والناس جزء من القرار.',
    image: 'https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/03-marketplace-feed.webp',
  },
  {
    key: 'detail',
    eyebrow: 'قيمة',
    title: 'كل حاجة ليها حكاية وفرصة',
    body: 'تفاصيل أغنى تساعدك تعرف الحاجة تستاهل تدخل عرض ولا لأ.',
    image: 'https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/04-item-detail.webp',
  },
  {
    key: 'chat',
    eyebrow: 'تبديل',
    title: 'العرض يتحول لكلام… والكلام لتبديلة',
    body: 'المحادثة والـdeal lifecycle في نفس الرحلة، بدل ما التبادل يبقى مجرد زر.',
    image: 'https://raw.githubusercontent.com/omarkhair70-droid/omar-khair-portfolio/main/public/work/teswa/06-exchange-chat.webp',
  },
] as const;

const journeySteps = [
  { icon: 'cube-outline' as const, label: 'عندك حاجة', note: 'لسه ليها قيمة' },
  { icon: 'sparkles-outline' as const, label: 'حد يكتشفها', note: 'وتبدأ فرصة' },
  { icon: 'swap-horizontal-outline' as const, label: 'عرض يحصل', note: 'مش سعر وخلاص' },
  { icon: 'chatbubbles-outline' as const, label: 'الكلام يبدأ', note: 'وتفهموا بعض' },
  { icon: 'checkmark-circle-outline' as const, label: 'تبديلة تمت', note: 'وقيمة اتحركت' },
] as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    }).catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

function ActionButton({
  label,
  icon,
  variant = 'primary',
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        variant === 'primary' ? styles.actionPrimary : styles.actionGhost,
        pressed && styles.actionPressed,
      ]}
    >
      <AppText weight="bold" style={variant === 'primary' ? styles.actionPrimaryText : styles.actionGhostText}>
        {label}
      </AppText>
      <Ionicons name={icon} size={18} color={variant === 'primary' ? '#FFFDF8' : '#1D1A16'} />
    </Pressable>
  );
}

function ProductMiniCard({ compact = false }: { compact?: boolean }) {
  return (
    <LinearGradient
      colors={['rgba(255,253,248,0.98)', 'rgba(255,247,236,0.97)', 'rgba(238,216,203,0.78)']}
      style={[styles.productMiniCard, compact && styles.productMiniCardCompact]}
    >
      <View style={styles.productMiniVisual}>
        <LinearGradient colors={['#F4C49E', '#D98962', '#B8623F']} style={StyleSheet.absoluteFill} />
        <View style={styles.productMiniObject}>
          <Ionicons name="headset-outline" size={compact ? 25 : 34} color="#FFFDF8" />
        </View>
        <View style={styles.videoPill}>
          <Ionicons name="play-circle-outline" size={13} color="#B8623F" />
          <AppText weight="semibold" style={styles.videoPillText}>لمحة فيديو</AppText>
        </View>
      </View>
      <View style={styles.productMiniCopy}>
        <AppText weight="bold" style={styles.productMiniTitle}>سماعة لسه جديدة</AppText>
        <View style={styles.productMiniMeta}>
          <View style={styles.metaPill}><Ionicons name="shield-checkmark-outline" size={12} color="#3E7C73" /><AppText style={styles.metaPillText}>حالة ممتازة</AppText></View>
          <View style={styles.metaPill}><Ionicons name="location-outline" size={12} color="#8A5A2D" /><AppText style={styles.metaPillText}>قريب منك</AppText></View>
        </View>
      </View>
    </LinearGradient>
  );
}

function HeroWorld({ wide, reducedMotion }: { wide: boolean; reducedMotion: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      drift.setValue(0.45);
      pulse.setValue(0.4);
      return;
    }

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 3400, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 3400, useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    );

    driftLoop.start();
    pulseLoop.start();
    return () => {
      driftLoop.stop();
      pulseLoop.stop();
    };
  }, [drift, pulse, reducedMotion]);

  return (
    <View style={[styles.heroWorld, !wide && styles.heroWorldMobile]}>
      <LinearGradient colors={['#141B39', '#223B5C', '#2F6C74', '#223B5C']} style={StyleSheet.absoluteFill} />
      <View style={styles.heroGrid} />
      <Animated.View
        style={[
          styles.heroGlow,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.floatingChip,
          styles.floatingChipOne,
          {
            transform: [
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 9] }) },
              { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '2deg'] }) },
            ],
          },
        ]}
      >
        <Ionicons name="phone-portrait-outline" size={17} color="#ABD4FF" />
        <AppText style={styles.floatingChipText}>موبايل</AppText>
      </Animated.View>

      <Animated.View
        style={[
          styles.floatingChip,
          styles.floatingChipTwo,
          {
            transform: [
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [8, -7] }) },
              { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['2deg', '-2deg'] }) },
            ],
          },
        ]}
      >
        <Ionicons name="game-controller-outline" size={17} color="#F8D080" />
        <AppText style={styles.floatingChipText}>فرصة</AppText>
      </Animated.View>

      <Animated.View
        style={[
          styles.floatingChip,
          styles.floatingChipThree,
          {
            transform: [
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-7, 8] }) },
              { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [4, -5] }) },
            ],
          },
        ]}
      >
        <Ionicons name="bag-handle-outline" size={17} color="#FFB9A6" />
        <AppText style={styles.floatingChipText}>حاجة ليك</AppText>
      </Animated.View>

      <View style={styles.worldRail}>
        <View style={styles.worldRailLine} />
        {[0, 1, 2, 3].map((dot) => <View key={dot} style={[styles.worldRailDot, { left: `${12 + dot * 25}%` }]} />)}
      </View>

      <View style={[styles.heroProductWrap, !wide && styles.heroProductWrapMobile]}>
        <ProductMiniCard compact={!wide} />
      </View>

      <View style={styles.exchangeBadge}>
        <View style={styles.exchangeBadgeIcon}><Ionicons name="swap-horizontal" size={22} color="#1B1E3D" /></View>
        <View>
          <AppText weight="bold" style={styles.exchangeBadgeTitle}>قيمة بتتحرك</AppText>
          <AppText style={styles.exchangeBadgeText}>من حاجة مركونة → فرصة جديدة</AppText>
        </View>
      </View>

      <View style={styles.citySilhouette}>
        {[58, 84, 68, 102, 74, 91, 61].map((height, index) => (
          <View key={index} style={[styles.cityBuilding, { height }]} />
        ))}
      </View>
    </View>
  );
}

function ValueJourney({ wide, reducedMotion }: { wide: boolean; reducedMotion: boolean }) {
  const carry = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      carry.setValue(0.58);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(carry, { toValue: 1, duration: 5200, useNativeDriver: true }),
        Animated.timing(carry, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [carry, reducedMotion]);

  const distance = wide ? 660 : 0;

  return (
    <View style={styles.journeyShell}>
      <View style={[styles.journeyHeader, wide && styles.sectionHeaderWide]}>
        <View style={styles.sectionKicker}><View style={styles.kickerDot} /><AppText weight="bold" style={styles.sectionKickerText}>القيمة مش ثابتة</AppText></View>
        <AppText weight="bold" style={styles.sectionTitle}>الحاجة مش بتنتهي لما تبطل تستخدمها.</AppText>
        <AppText style={styles.sectionBody}>في تسوى، نفس الحاجة بتعدّي على سلسلة من اللحظات لحد ما تفتح باب لحاجة أنسب ليك.</AppText>
      </View>

      <View style={[styles.journeyTrack, !wide && styles.journeyTrackMobile]}>
        <View style={[styles.journeyConnector, !wide && styles.journeyConnectorMobile]} />
        {journeySteps.map((step, index) => (
          <View key={step.label} style={[styles.journeyNode, !wide && styles.journeyNodeMobile]}>
            <View style={styles.journeyNodeIcon}><Ionicons name={step.icon} size={20} color="#B8623F" /></View>
            <View style={styles.journeyNodeCopy}>
              <AppText weight="bold" style={styles.journeyNodeLabel}>{step.label}</AppText>
              <AppText style={styles.journeyNodeNote}>{step.note}</AppText>
            </View>
          </View>
        ))}

        {wide ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.carryObject,
              {
                transform: [
                  { translateX: carry.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) },
                  { rotate: carry.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) },
                ],
              },
            ]}
          >
            <Ionicons name="headset" size={18} color="#FFFDF8" />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function ProductEvidence({ wide }: { wide: boolean }) {
  return (
    <View style={styles.evidenceSection}>
      <View style={[styles.sectionHeader, wide && styles.sectionHeaderWide]}>
        <View style={styles.sectionKicker}><View style={styles.kickerDotTeal} /><AppText weight="bold" style={styles.sectionKickerText}>ده المنتج نفسه</AppText></View>
        <AppText weight="bold" style={styles.sectionTitle}>مش بنشرح تسوى برسومات وهمية.</AppText>
        <AppText style={styles.sectionBody}>دي لقطات فعلية من المنتج: اكتشاف، Marketplace، تفاصيل الحاجة، ومحادثة التبديل.</AppText>
      </View>

      <View style={[styles.evidenceGrid, !wide && styles.evidenceGridMobile]}>
        {productScreens.map((screen, index) => (
          <View key={screen.key} style={[styles.evidenceCard, wide && (index % 2 === 1 ? styles.evidenceCardOffset : null)]}>
            <View style={styles.evidencePhone}>
              <ExpoImage
                source={{ uri: screen.image }}
                accessibilityLabel={`لقطة فعلية من تِسوى: ${screen.title}`}
                style={styles.evidenceImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
              />
            </View>
            <View style={styles.evidenceCopy}>
              <AppText weight="bold" style={styles.evidenceEyebrow}>{screen.eyebrow}</AppText>
              <AppText weight="bold" style={styles.evidenceTitle}>{screen.title}</AppText>
              <AppText style={styles.evidenceBody}>{screen.body}</AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function OfferCarry({ wide, reducedMotion }: { wide: boolean; reducedMotion: boolean }) {
  const offer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      offer.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(offer, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(offer, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [offer, reducedMotion]);

  return (
    <LinearGradient colors={['#1A1D3A', '#203654', '#2B665F']} style={styles.offerSection}>
      <View style={[styles.offerCopy, wide && styles.offerCopyWide]}>
        <AppText weight="bold" style={styles.offerKicker}>من «عجباني» لـ «اتفقنا»</AppText>
        <AppText weight="bold" style={styles.offerTitle}>التبديل مش زر. هو علاقة بتتحرك.</AppText>
        <AppText style={styles.offerBody}>العرض له حالة، والقرار له وقت، وبعد القبول يبدأ Deal ومحادثة ومراحل لحد الاكتمال.</AppText>
      </View>

      <View style={[styles.offerStage, !wide && styles.offerStageMobile]}>
        <View style={styles.offerPersonCard}>
          <View style={styles.personAvatar}><Ionicons name="person-outline" size={18} color="#B8623F" /></View>
          <AppText weight="bold" style={styles.personTitle}>الحاجة عندك</AppText>
          <View style={styles.itemToken}><Ionicons name="headset-outline" size={24} color="#B8623F" /></View>
        </View>

        <View style={[styles.offerBridge, !wide && styles.offerBridgeMobile]}>
          <View style={[styles.offerBridgeLine, !wide && styles.offerBridgeLineMobile]} />
          <Animated.View
            style={[
              styles.offerMovingChip,
              wide
                ? { transform: [{ translateX: offer.interpolate({ inputRange: [0, 1], outputRange: [130, -130] }) }] }
                : { transform: [{ translateY: offer.interpolate({ inputRange: [0, 1], outputRange: [-72, 72] }) }] },
            ]}
          >
            <Ionicons name="swap-horizontal" size={15} color="#1B1E3D" />
            <AppText weight="bold" style={styles.offerMovingText}>عرض</AppText>
          </Animated.View>
          <View style={styles.offerState}><View style={styles.offerStateDot} /><AppText style={styles.offerStateText}>بانتظار الرد</AppText></View>
        </View>

        <View style={styles.offerPersonCard}>
          <View style={styles.personAvatarTeal}><Ionicons name="person-outline" size={18} color="#3E7C73" /></View>
          <AppText weight="bold" style={styles.personTitle}>فرصة جديدة</AppText>
          <View style={styles.itemTokenTeal}><Ionicons name="game-controller-outline" size={24} color="#3E7C73" /></View>
        </View>
      </View>
    </LinearGradient>
  );
}


function LivingWorldPulse({ wide, reducedMotion }: { wide: boolean; reducedMotion: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0.5);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <View style={styles.livingSection}>
      <View style={[styles.livingInner, wide && styles.livingInnerWide]}>
        <View style={[styles.livingCopy, wide && styles.livingCopyWide]}>
          <View style={styles.livingKicker}>
            <View style={styles.livingKickerDot} />
            <AppText weight="bold" style={styles.livingKickerText}>Living World / عالم تِسوى</AppText>
          </View>
          <AppText weight="bold" style={styles.livingTitle}>تِسوى مش Marketplace ساكت.</AppText>
          <AppText style={styles.livingBody}>
            السوق هو نقطة البداية. حوالي الحاجة فيه قصص، Motion، ناس، ومكان — عشان الاكتشاف يبقى عالم بيتحرّك، مش ليستة منتجات.
          </AppText>

          <View style={styles.livingSignals}>
            {[
              ['play-circle-outline', 'Motion'],
              ['albums-outline', 'قصص'],
              ['people-outline', 'ناس'],
              ['navigate-outline', 'قريب منك'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.livingSignal}>
                <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={15} color="#F6C58F" />
                <AppText weight="semibold" style={styles.livingSignalText}>{label}</AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.livingScene, !wide && styles.livingSceneMobile]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.livingRing,
              styles.livingRingOuter,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.34] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] }) }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.livingRing,
              styles.livingRingInner,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.12] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.02, 0.94] }) }],
              },
            ]}
          />

          <View style={styles.livingPhone}>
            <ExpoImage
              source={{ uri: MOVEMENT_SCREEN }}
              accessibilityLabel="لقطة فعلية من تجربة الحركة والاكتشاف في تِسوى"
              style={styles.livingImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
            />
          </View>

          <View style={[styles.livingFloat, styles.livingFloatOne]}>
            <Ionicons name="location-outline" size={14} color="#B8623F" />
            <AppText weight="bold" style={styles.livingFloatText}>نبض المدينة</AppText>
          </View>
          <View style={[styles.livingFloat, styles.livingFloatTwo]}>
            <Ionicons name="sparkles-outline" size={14} color="#3E7C73" />
            <AppText weight="bold" style={styles.livingFloatText}>فرص حواليك</AppText>
          </View>
          <View style={[styles.livingFloat, styles.livingFloatThree]}>
            <Ionicons name="videocam-outline" size={14} color="#8A5A2D" />
            <AppText weight="bold" style={styles.livingFloatText}>حركة تِسوى</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

export function TeswaPublicFrontDoorPrototype() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<SectionKey, number>>({
    value: 0,
    product: 0,
    swap: 0,
  });

  const enterTeswa = () => {
    router.push((user ? '/(tabs)/home' : '/(auth)/login') as never);
  };

  const openPlay = () => {
    void Linking.openURL(PLAY_URL);
  };

  const registerSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = (key: SectionKey) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, sectionOffsets.current[key] - 72),
      animated: !reducedMotion,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.navShell}>
        <View style={[styles.nav, !wide && styles.navMobile]}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><AppText weight="bold" style={styles.brandMarkText}>تِ</AppText></View>
            <AppText weight="bold" style={styles.brandName}>تِسوى</AppText>
          </View>

          {wide ? (
            <View style={styles.navLinks}>
              {NAV_LINKS.map((link) => (
                <Pressable
                  key={link.target}
                  accessibilityRole="link"
                  accessibilityLabel={`انتقل إلى قسم ${link.label}`}
                  onPress={() => scrollToSection(link.target)}
                  style={({ pressed }) => [styles.navLinkButton, pressed && styles.navLinkPressed]}
                >
                  <AppText style={styles.navLink}>{link.label}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable onPress={enterTeswa} style={styles.navEnter}>
            <AppText weight="bold" style={styles.navEnterText}>{user ? 'افتح تسوى' : 'دخول'}</AppText>
            <Ionicons name="arrow-back" size={15} color="#1D1A16" />
          </Pressable>
        </View>
        </View>

        <View style={[styles.hero, wide && styles.heroWide]}>
          <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
            <View style={styles.heroEyebrow}>
              <View style={styles.heroEyebrowPulse} />
              <AppText weight="bold" style={styles.heroEyebrowText}>سوق اجتماعي للتبديل — عربي من البداية</AppText>
            </View>

            <AppText weight="bold" style={[styles.heroTitle, wide && styles.heroTitleWide]}>
              حاجتك لسه لها قيمة.
            </AppText>
            <AppText weight="bold" style={[styles.heroAccentTitle, wide && styles.heroAccentTitleWide]}>
              قبل ما تسيبها، شوف تِسوى إيه.
            </AppText>
            <AppText style={[styles.heroBody, wide && styles.heroBodyWide]}>
              اعرض حاجة عندك، اكتشف الناس والحاجات حواليك، ابعت عرض، واتكلم لحد ما القيمة تتحرك من حاجة مركونة لفرصة جديدة.
            </AppText>

            <View style={[styles.heroActions, !wide && styles.heroActionsMobile]}>
              <ActionButton label={user ? 'افتح تسوى' : 'ادخل عالم تسوى'} icon="arrow-back" onPress={enterTeswa} />
              <ActionButton label="Google Play" icon="logo-google-playstore" variant="ghost" onPress={openPlay} />
            </View>

            <View style={styles.heroProofRow}>
              <View style={styles.heroProof}><Ionicons name="swap-horizontal-outline" size={17} color="#B8623F" /><AppText style={styles.heroProofText}>Offers + Deals</AppText></View>
              <View style={styles.heroProof}><Ionicons name="chatbubble-ellipses-outline" size={17} color="#3E7C73" /><AppText style={styles.heroProofText}>رسائل حقيقية</AppText></View>
              <View style={styles.heroProof}><Ionicons name="location-outline" size={17} color="#8A5A2D" /><AppText style={styles.heroProofText}>اكتشاف محلي</AppText></View>
            </View>
          </View>

          <HeroWorld wide={wide} reducedMotion={reducedMotion} />
        </View>

        <View style={styles.valueBand}>
          <AppText weight="bold" style={styles.valueBandBig}>بدّل.</AppText>
          <View style={styles.valueBandDot} />
          <AppText weight="bold" style={styles.valueBandBig}>اكتشف.</AppText>
          <View style={styles.valueBandDot} />
          <AppText weight="bold" style={styles.valueBandBig}>خلّي الحاجة تكمل.</AppText>
        </View>

        <View onLayout={registerSection('value')}>
          <ValueJourney wide={wide} reducedMotion={reducedMotion} />
        </View>

        <LivingWorldPulse wide={wide} reducedMotion={reducedMotion} />

        <View onLayout={registerSection('product')}>
          <ProductEvidence wide={wide} />
        </View>

        <View onLayout={registerSection('swap')}>
          <OfferCarry wide={wide} reducedMotion={reducedMotion} />
        </View>

        <View style={[styles.finalCta, wide && styles.finalCtaWide]}>
          <View style={styles.finalCtaGlow} />
          <View style={styles.finalCtaCopy}>
            <AppText weight="bold" style={styles.finalCtaKicker}>كل حاجة ليها فرصة تانية.</AppText>
            <AppText weight="bold" style={styles.finalCtaTitle}>سيب الحاجة تتحرك.</AppText>
            <AppText style={styles.finalCtaBody}>ادخل تسوى وشوف الفرص اللي ممكن تبدأ من حاجة عندك أصلًا.</AppText>
          </View>
          <View style={[styles.heroActions, !wide && styles.heroActionsMobile]}>
            <ActionButton label={user ? 'افتح تسوى' : 'ابدأ دلوقتي'} icon="arrow-back" onPress={enterTeswa} />
            <ActionButton label="نزّل التطبيق" icon="download-outline" variant="ghost" onPress={openPlay} />
          </View>
        </View>

        <View style={[styles.footer, !wide && styles.footerMobile]}>
          <View style={styles.brand}>
            <View style={styles.brandMarkSmall}><AppText weight="bold" style={styles.brandMarkSmallText}>تِ</AppText></View>
            <View>
              <AppText weight="bold" style={styles.footerBrand}>تِسوى</AppText>
              <AppText style={styles.footerNote}>حاجتك لسه لها قيمة.</AppText>
            </View>
          </View>
          <View style={styles.footerLinks}>
            <Pressable onPress={() => router.push('/legal/privacy' as never)}><AppText style={styles.footerLink}>الخصوصية</AppText></Pressable>
            <Pressable onPress={() => router.push('/legal/terms' as never)}><AppText style={styles.footerLink}>الشروط</AppText></Pressable>
            <Pressable onPress={() => router.push('/account-deletion' as never)}><AppText style={styles.footerLink}>حذف الحساب</AppText></Pressable>
          </View>
        </View>

        {Platform.OS === 'web' ? <View style={{ height: 24 }} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F9F3EA' },
  scrollContent: { flexGrow: 1 },

  navShell: {
    width: '100%',
    backgroundColor: 'rgba(249,243,234,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(29,26,22,0.06)',
    zIndex: 30,
  },
  nav: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    minHeight: 82,
    paddingHorizontal: 30,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
  },
  navMobile: { minHeight: 70, paddingHorizontal: 18 },
  brand: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#B8623F', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  brandMarkText: { color: '#FFFDF8', fontSize: 23 },
  brandName: { fontSize: 22, color: '#1D1A16' },
  navLinks: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  navLinkButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 999 },
  navLinkPressed: { backgroundColor: 'rgba(184,98,63,0.08)' },
  navLink: { color: '#746A61', fontSize: 14 },
  navEnter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(29,26,22,0.14)', backgroundColor: 'rgba(255,253,248,0.72)' },
  navEnterText: { color: '#1D1A16', fontSize: 13 },

  hero: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 40, paddingBottom: 60, gap: 36 },
  heroWide: { minHeight: 720, paddingHorizontal: 30, paddingTop: 72, paddingBottom: 90, flexDirection: 'row-reverse', alignItems: 'center', gap: 56 },
  heroCopy: { flex: 1, alignItems: 'flex-end' },
  heroCopyWide: { maxWidth: 560 },
  heroEyebrow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', backgroundColor: 'rgba(255,253,248,0.72)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginBottom: 24 },
  heroEyebrowPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B8623F' },
  heroEyebrowText: { fontSize: 12, color: '#6E3E2B', textAlign: 'right' },
  heroTitle: { width: '100%', fontSize: 46, lineHeight: 58, color: '#1D1A16', textAlign: 'right', writingDirection: 'rtl' },
  heroTitleWide: { fontSize: 72, lineHeight: 82 },
  heroAccentTitle: { width: '100%', fontSize: 31, lineHeight: 42, color: '#B8623F', textAlign: 'right', writingDirection: 'rtl', marginTop: 10 },
  heroAccentTitleWide: { fontSize: 43, lineHeight: 56 },
  heroBody: { width: '100%', fontSize: 17, lineHeight: 30, color: '#655C55', textAlign: 'right', writingDirection: 'rtl', marginTop: 24 },
  heroBodyWide: { maxWidth: 520, fontSize: 18, lineHeight: 32 },
  heroActions: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 28 },
  heroActionsMobile: { flexDirection: 'column', alignItems: 'stretch' },
  action: { minHeight: 52, borderRadius: 17, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1 },
  actionPrimary: { backgroundColor: '#B8623F', borderColor: '#B8623F' },
  actionGhost: { backgroundColor: 'rgba(255,253,248,0.84)', borderColor: 'rgba(29,26,22,0.13)' },
  actionPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  actionPrimaryText: { color: '#FFFDF8', fontSize: 15 },
  actionGhostText: { color: '#1D1A16', fontSize: 15 },
  heroProofRow: { width: '100%', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9, marginTop: 22 },
  heroProof: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(255,253,248,0.62)', borderWidth: 1, borderColor: 'rgba(29,26,22,0.08)' },
  heroProofText: { color: '#746A61', fontSize: 11 },

  heroWorld: { flex: 1, minHeight: 570, borderRadius: 42, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#141B39', shadowOpacity: 0.18, shadowRadius: 38, shadowOffset: { width: 0, height: 18 } },
  heroWorldMobile: { minHeight: 500, borderRadius: 30 },
  heroGrid: { ...ABSOLUTE_FILL, opacity: 0.08, borderWidth: 1, borderColor: '#FFFFFF' },
  heroGlow: { position: 'absolute', top: 48, right: 58, width: 210, height: 210, borderRadius: 105, backgroundColor: '#F6A15B' },
  floatingChip: { position: 'absolute', zIndex: 5, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  floatingChipOne: { top: 64, left: 32 },
  floatingChipTwo: { top: 132, right: 28 },
  floatingChipThree: { top: 250, left: 22 },
  floatingChipText: { color: '#F5F8FC', fontSize: 11 },
  worldRail: { position: 'absolute', left: 24, right: 24, bottom: 95, height: 70, justifyContent: 'center' },
  worldRailLine: { height: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  worldRailDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: '#F8D080', top: 31 },
  heroProductWrap: { position: 'absolute', width: 270, right: 64, top: 142, transform: [{ rotate: '4deg' }] },
  heroProductWrapMobile: { width: 230, right: 22, top: 170 },
  productMiniCard: { borderRadius: 26, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', gap: 10 },
  productMiniCardCompact: { borderRadius: 22 },
  productMiniVisual: { height: 210, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  productMiniObject: { width: 82, height: 82, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  videoPill: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row-reverse', gap: 5, alignItems: 'center', borderRadius: 999, backgroundColor: 'rgba(255,253,248,0.94)', paddingHorizontal: 8, paddingVertical: 5 },
  videoPillText: { color: '#B8623F', fontSize: 10 },
  productMiniCopy: { gap: 8 },
  productMiniTitle: { fontSize: 15, color: '#1D1A16', textAlign: 'right' },
  productMiniMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 5 },
  metaPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(29,26,22,0.08)', paddingHorizontal: 7, paddingVertical: 4 },
  metaPillText: { color: '#746A61', fontSize: 9 },
  exchangeBadge: { position: 'absolute', left: 28, bottom: 174, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,253,248,0.93)', borderRadius: 18, padding: 12, maxWidth: 225 },
  exchangeBadgeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F6A15B', alignItems: 'center', justifyContent: 'center' },
  exchangeBadgeTitle: { color: '#1D1A16', fontSize: 13, textAlign: 'right' },
  exchangeBadgeText: { color: '#746A61', fontSize: 10, textAlign: 'right', marginTop: 2 },
  citySilhouette: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 118, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', opacity: 0.32 },
  cityBuilding: { width: '10%', backgroundColor: '#0F1A2A', borderTopLeftRadius: 12, borderTopRightRadius: 12 },

  valueBand: { minHeight: 106, backgroundColor: '#B8623F', paddingHorizontal: 22, paddingVertical: 24, flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14 },
  valueBandBig: { color: '#FFFDF8', fontSize: 24 },
  valueBandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F6C69D' },

  journeyShell: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 100 },
  journeyHeader: { alignItems: 'flex-end', marginBottom: 48 },
  sectionHeader: { alignItems: 'flex-end', marginBottom: 42 },
  sectionHeaderWide: { maxWidth: 720, alignSelf: 'flex-end' },
  sectionKicker: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginBottom: 12 },
  kickerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#B8623F' },
  kickerDotTeal: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#3E7C73' },
  sectionKickerText: { color: '#746A61', fontSize: 12 },
  sectionTitle: { color: '#1D1A16', fontSize: 35, lineHeight: 47, textAlign: 'right', writingDirection: 'rtl' },
  sectionBody: { color: '#746A61', fontSize: 16, lineHeight: 29, textAlign: 'right', writingDirection: 'rtl', marginTop: 12, maxWidth: 680 },
  journeyTrack: { position: 'relative', minHeight: 180, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14 },
  journeyTrackMobile: { minHeight: 570, flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 0 },
  journeyConnector: { position: 'absolute', left: 70, right: 70, top: 66, height: 2, backgroundColor: 'rgba(184,98,63,0.18)' },
  journeyConnectorMobile: { left: 'auto', right: 26, top: 40, bottom: 40, width: 2, height: 'auto' },
  journeyNode: { width: 142, alignItems: 'center', zIndex: 2 },
  journeyNodeMobile: { width: '100%', minHeight: 88, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingRight: 0 },
  journeyNodeIcon: { width: 54, height: 54, borderRadius: 19, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', alignItems: 'center', justifyContent: 'center' },
  journeyNodeCopy: { alignItems: 'center', marginTop: 12 },
  journeyNodeLabel: { color: '#1D1A16', fontSize: 14, textAlign: 'center' },
  journeyNodeNote: { color: '#746A61', fontSize: 11, marginTop: 4, textAlign: 'center' },
  carryObject: { position: 'absolute', right: 48, top: 36, width: 42, height: 42, borderRadius: 14, backgroundColor: '#B8623F', alignItems: 'center', justifyContent: 'center', zIndex: 5, shadowColor: '#B8623F', shadowOpacity: 0.25, shadowRadius: 18 },


  livingSection: {
    width: '100%',
    backgroundColor: '#171C33',
    paddingVertical: 104,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  livingInner: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    gap: 48,
  },
  livingInnerWide: {
    minHeight: 640,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 70,
  },
  livingCopy: { alignItems: 'flex-end' },
  livingCopyWide: { width: '45%' },
  livingKicker: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  livingKickerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F6A15B' },
  livingKickerText: { color: '#F6C58F', fontSize: 12 },
  livingTitle: {
    color: '#FFFFFF',
    fontSize: 39,
    lineHeight: 52,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  livingBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    lineHeight: 30,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 16,
    maxWidth: 540,
  },
  livingSignals: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 24,
  },
  livingSignal: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  livingSignalText: { color: 'rgba(255,255,255,0.82)', fontSize: 11 },
  livingScene: {
    width: '48%',
    minHeight: 560,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livingSceneMobile: { width: '100%', minHeight: 530 },
  livingRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#F6A15B',
    borderRadius: 999,
  },
  livingRingOuter: { width: 470, height: 470 },
  livingRingInner: { width: 330, height: 330, borderColor: '#65A49A' },
  livingPhone: {
    width: 255,
    height: 500,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: '#0D1020',
    borderWidth: 7,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 18 },
    zIndex: 3,
  },
  livingImage: { width: '100%', height: '100%' },
  livingFloat: {
    position: 'absolute',
    zIndex: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,253,248,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  livingFloatOne: { top: 82, left: 8 },
  livingFloatTwo: { top: 205, right: 2 },
  livingFloatThree: { bottom: 84, left: 12 },
  livingFloatText: { color: '#2A2723', fontSize: 11 },

  evidenceSection: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 110, paddingBottom: 120 },
  evidenceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between' },
  evidenceGridMobile: { flexDirection: 'column' },
  evidenceCard: { width: '48%', borderRadius: 30, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: 'rgba(29,26,22,0.08)', padding: 16, gap: 18 },
  evidenceCardOffset: { marginTop: 72 },
  evidencePhone: { width: '100%', aspectRatio: 0.82, borderRadius: 24, overflow: 'hidden', backgroundColor: '#EEE7DF' },
  evidenceImage: { width: '100%', height: '100%' },
  evidenceCopy: { alignItems: 'flex-end', paddingHorizontal: 6, paddingBottom: 4 },
  evidenceEyebrow: { color: '#B8623F', fontSize: 11, marginBottom: 7 },
  evidenceTitle: { color: '#1D1A16', fontSize: 21, lineHeight: 30, textAlign: 'right', writingDirection: 'rtl' },
  evidenceBody: { color: '#746A61', fontSize: 13, lineHeight: 23, textAlign: 'right', writingDirection: 'rtl', marginTop: 8 },

  offerSection: { width: '100%', paddingHorizontal: 18, paddingVertical: 100, alignItems: 'center' },
  offerCopy: { width: '100%', maxWidth: 680, alignItems: 'flex-end', marginBottom: 56 },
  offerCopyWide: { alignSelf: 'center' },
  offerKicker: { color: '#F6A15B', fontSize: 13, marginBottom: 12 },
  offerTitle: { color: '#FFFFFF', fontSize: 38, lineHeight: 50, textAlign: 'right', writingDirection: 'rtl' },
  offerBody: { color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 29, textAlign: 'right', writingDirection: 'rtl', marginTop: 14 },
  offerStage: { width: '100%', maxWidth: 920, minHeight: 250, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  offerStageMobile: { minHeight: 620, flexDirection: 'column' },
  offerPersonCard: { width: 230, minHeight: 200, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.94)', padding: 18, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  personAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#EED8CB', alignItems: 'center', justifyContent: 'center' },
  personAvatarTeal: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#D7E8E5', alignItems: 'center', justifyContent: 'center' },
  personTitle: { color: '#1D1A16', fontSize: 14 },
  itemToken: { width: 74, height: 74, borderRadius: 24, backgroundColor: '#FFF4E8', borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', alignItems: 'center', justifyContent: 'center' },
  itemTokenTeal: { width: 74, height: 74, borderRadius: 24, backgroundColor: '#EAF6F3', borderWidth: 1, borderColor: 'rgba(62,124,115,0.2)', alignItems: 'center', justifyContent: 'center' },
  offerBridge: { flex: 1, minWidth: 300, height: 130, alignItems: 'center', justifyContent: 'center' },
  offerBridgeMobile: { flex: 0, minWidth: 0, width: 160, height: 190 },
  offerBridgeLine: { position: 'absolute', left: 20, right: 20, height: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  offerBridgeLineMobile: { top: 10, bottom: 10, left: 79, right: 'auto', width: 2, height: 'auto' },
  offerMovingChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: '#F6A15B', paddingHorizontal: 12, paddingVertical: 8, zIndex: 3 },
  offerMovingText: { color: '#1B1E3D', fontSize: 11 },
  offerState: { position: 'absolute', bottom: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  offerStateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F8D080' },
  offerStateText: { color: 'rgba(255,255,255,0.78)', fontSize: 10 },

  finalCta: { marginHorizontal: 18, marginVertical: 80, borderRadius: 34, padding: 28, backgroundColor: '#F3E1D2', borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', overflow: 'hidden', gap: 28 },
  finalCtaWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', marginHorizontal: 0, padding: 52, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  finalCtaGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(184,98,63,0.1)', top: -100, left: -50 },
  finalCtaCopy: { flex: 1, alignItems: 'flex-end' },
  finalCtaKicker: { color: '#B8623F', fontSize: 12, marginBottom: 9 },
  finalCtaTitle: { color: '#1D1A16', fontSize: 35, lineHeight: 44, textAlign: 'right' },
  finalCtaBody: { color: '#746A61', fontSize: 15, lineHeight: 27, textAlign: 'right', marginTop: 10, maxWidth: 520 },

  footer: { width: '100%', maxWidth: 1240, alignSelf: 'center', borderTopWidth: 1, borderTopColor: 'rgba(29,26,22,0.09)', paddingHorizontal: 30, paddingVertical: 34, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 24 },
  footerMobile: { paddingHorizontal: 18, flexDirection: 'column', alignItems: 'stretch' },
  brandMarkSmall: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#B8623F', alignItems: 'center', justifyContent: 'center' },
  brandMarkSmallText: { color: '#FFFDF8', fontSize: 18 },
  footerBrand: { color: '#1D1A16', fontSize: 16, textAlign: 'right' },
  footerNote: { color: '#746A61', fontSize: 10, textAlign: 'right', marginTop: 2 },
  footerLinks: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 18 },
  footerLink: { color: '#746A61', fontSize: 12 },
});
