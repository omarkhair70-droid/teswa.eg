import { Ionicons } from '@expo/vector-icons';
import type { UserBadge } from '@/lib/badges';

type BadgePresentationInput = UserBadge | { badgeKey?: string; category?: string; iconName?: string | null };

type BadgeTone = 'swap' | 'trust' | 'early' | 'special' | 'community' | 'profile' | 'general';

export type BadgePresentation = {
  iconName: keyof typeof Ionicons.glyphMap;
  tone: BadgeTone;
  categoryLabelAr: string;
  shortHintAr: string;
};

const CATEGORY_META: Record<string, Pick<BadgePresentation, 'tone' | 'categoryLabelAr'>> = {
  swap: { tone: 'swap', categoryLabelAr: 'تبديل' },
  trust: { tone: 'trust', categoryLabelAr: 'ثقة' },
  early: { tone: 'early', categoryLabelAr: 'بداية' },
  special: { tone: 'special', categoryLabelAr: 'خاص' },
  community: { tone: 'community', categoryLabelAr: 'مجتمع' },
  profile: { tone: 'profile', categoryLabelAr: 'ملف' },
};

const CATEGORY_FALLBACK_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  swap: 'swap-horizontal-outline',
  trust: 'shield-checkmark-outline',
  early: 'sparkles-outline',
  special: 'star-outline',
  community: 'people-outline',
  profile: 'person-circle-outline',
};

function resolveIconName(iconName: string | null | undefined, category: string): keyof typeof Ionicons.glyphMap {
  if (iconName && iconName in Ionicons.glyphMap) return iconName as keyof typeof Ionicons.glyphMap;
  return CATEGORY_FALLBACK_ICONS[category] ?? 'ribbon-outline';
}

export function getBadgePresentation(badge: BadgePresentationInput): BadgePresentation {
  if (badge.badgeKey === 'first_swap') {
    return {
      iconName: resolveIconName(badge.iconName, 'swap'),
      tone: 'swap',
      categoryLabelAr: 'تبديل',
      shortHintAr: 'أول خطوة في سجل التبديل.',
    };
  }

  if (badge.badgeKey === 'reliable_swapper') {
    return {
      iconName: resolveIconName(badge.iconName, 'trust'),
      tone: 'trust',
      categoryLabelAr: 'ثقة',
      shortHintAr: 'شارة مبنية على التبديلات والتواصل.',
    };
  }

  if (badge.badgeKey === 'early_swapper') {
    return {
      iconName: resolveIconName(badge.iconName, 'early'),
      tone: 'early',
      categoryLabelAr: 'بداية',
      shortHintAr: 'من أوائل مجتمع تِسوى.',
    };
  }

  if (badge.badgeKey === 'founder_badge') {
    return {
      iconName: resolveIconName(badge.iconName, 'special'),
      tone: 'special',
      categoryLabelAr: 'خاص',
      shortHintAr: 'شارة خاصة من تِسوى.',
    };
  }

  const category = badge.category ?? '';
  const meta = CATEGORY_META[category] ?? { tone: 'general' as const, categoryLabelAr: 'عام' };

  return {
    iconName: resolveIconName(badge.iconName, category),
    tone: meta.tone,
    categoryLabelAr: meta.categoryLabelAr,
    shortHintAr: 'شارة ضمن سجل الثقة على تِسوى.',
  };
}
