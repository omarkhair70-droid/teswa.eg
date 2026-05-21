import type { TrustLevelKey } from '@/lib/trust-metrics';

export type TrustLevelPresentationTone = 'neutral' | 'warm' | 'trusted' | 'premium';

export type TrustLevelPresentation = {
  key: TrustLevelKey | 'fallback';
  labelAr: string;
  shortLabelAr: string;
  descriptionAr: string;
  iconName: string;
  tone: TrustLevelPresentationTone;
};

const FALLBACK_PRESENTATION: TrustLevelPresentation = {
  key: 'fallback',
  labelAr: 'مؤشر الثقة',
  shortLabelAr: 'ثقة',
  descriptionAr: 'مؤشر الثقة بيتكوّن تدريجيًا مع النشاط الحقيقي.',
  iconName: 'shield-outline',
  tone: 'neutral',
};

const TRUST_LEVEL_PRESENTATION: Record<TrustLevelKey, TrustLevelPresentation> = {
  new_swapper: {
    key: 'new_swapper',
    labelAr: 'لسه بيبدأ',
    shortLabelAr: 'بداية',
    descriptionAr: 'مؤشر الثقة بيتكوّن مع أول التبديلات والتقييمات.',
    iconName: 'leaf-outline',
    tone: 'neutral',
  },
  rising_swapper: {
    key: 'rising_swapper',
    labelAr: 'بيثبت حضوره',
    shortLabelAr: 'صاعد',
    descriptionAr: 'عنده إشارات إيجابية أولية في التبديل والتواصل.',
    iconName: 'trending-up-outline',
    tone: 'warm',
  },
  reliable_swapper: {
    key: 'reliable_swapper',
    labelAr: 'موثوق في التبديل',
    shortLabelAr: 'موثوق',
    descriptionAr: 'عنده تجارب مكتملة وإشارات ثقة قوية.',
    iconName: 'shield-checkmark-outline',
    tone: 'trusted',
  },
  trusted_swapper: {
    key: 'trusted_swapper',
    labelAr: 'موثوق جدًا',
    shortLabelAr: 'موثوق جدًا',
    descriptionAr: 'سجل قوي في التبديل والتقييمات والتواصل.',
    iconName: 'sparkles-outline',
    tone: 'premium',
  },
};

export function getTrustLevelPresentation(levelKey: TrustLevelKey | string | null | undefined): TrustLevelPresentation {
  if (!levelKey) return FALLBACK_PRESENTATION;
  if (levelKey in TRUST_LEVEL_PRESENTATION) {
    return TRUST_LEVEL_PRESENTATION[levelKey as TrustLevelKey];
  }
  return FALLBACK_PRESENTATION;
}
