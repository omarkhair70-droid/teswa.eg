import type { ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';
import type { MarketplaceItem } from '@/lib/marketplace-items';
import type { StoryDiscoveryItem } from '@/lib/story-discovery';

export type DiscoverIntelligenceSignalTone = 'items' | 'video' | 'stories' | 'filters' | 'quiet';

export type DiscoverIntelligenceSignal = {
  key: string;
  label: string;
  value: number | string;
  icon: string;
  tone: DiscoverIntelligenceSignalTone;
};

export type DiscoverIntelligenceState = {
  eyebrow: string;
  title: string;
  body: string;
  tone: 'alive' | 'story' | 'visual' | 'filtered' | 'calm';
  signals: DiscoverIntelligenceSignal[];
};

type BuildDiscoverIntelligenceInput = {
  _itemsSample?: MarketplaceItem[];
  _storiesSample?: StoryDiscoveryItem[];
  _videosSample?: ItemVideoDiscoveryMoment[];
  visibleItemsCount: number;
  loadedItemsCount: number;
  videoMomentsCount: number;
  storyHighlightsCount: number;
  activeFiltersCount: number;
  nearbyLabel: string | null;
};

function itemsSignal(value: number): DiscoverIntelligenceSignal | null {
  return value > 0 ? { key: 'items', label: 'عناصر ظاهرة', value, icon: 'cube-outline', tone: 'items' } : null;
}

function storiesSignal(value: number): DiscoverIntelligenceSignal | null {
  return value > 0 ? { key: 'stories', label: 'عناصر بحكاية', value, icon: 'book-outline', tone: 'stories' } : null;
}

function videoSignal(value: number): DiscoverIntelligenceSignal | null {
  return value > 0 ? { key: 'video', label: 'لمحات مرئية', value, icon: 'videocam-outline', tone: 'video' } : null;
}

function filtersSignal(value: number): DiscoverIntelligenceSignal | null {
  return value > 0 ? { key: 'filters', label: 'فلترات نشطة', value, icon: 'options-outline', tone: 'filters' } : null;
}

function withFallbackSignal(signals: Array<DiscoverIntelligenceSignal | null>): DiscoverIntelligenceSignal[] {
  const positive = signals.filter((signal): signal is DiscoverIntelligenceSignal => Boolean(signal));
  if (positive.length > 0) return positive;
  return [{ key: 'quiet', label: 'المشهد هادئ', value: 'الآن', icon: 'pulse-outline', tone: 'quiet' }];
}

export function buildDiscoverIntelligenceState(input: BuildDiscoverIntelligenceInput): DiscoverIntelligenceState {
  if (input.activeFiltersCount > 0 && input.visibleItemsCount > 0) {
    return {
      tone: 'filtered',
      eyebrow: 'المشهد اتضبط',
      title: 'نتائج أقرب لاختيارك',
      body: input.nearbyLabel
        ? `الفلاتر والموقع قرّبوا لك المشهد حول ${input.nearbyLabel}.`
        : 'الفلاتر اختصرت الطريق وقرّبت لك العناصر المناسبة.',
      signals: withFallbackSignal([
        itemsSignal(input.visibleItemsCount),
        filtersSignal(input.activeFiltersCount),
        storiesSignal(input.storyHighlightsCount),
        videoSignal(input.videoMomentsCount),
      ]),
    };
  }

  if (input.storyHighlightsCount > 0 && input.videoMomentsCount > 0) {
    return {
      tone: 'alive',
      eyebrow: 'اكتشاف أعمق',
      title: 'المشهد فيه حكاية ولمحة',
      body: 'عناصر لها قصة، وعناصر تقدر تشوفها أقرب قبل ما تفتح التفاصيل.',
      signals: withFallbackSignal([
        storiesSignal(input.storyHighlightsCount),
        videoSignal(input.videoMomentsCount),
        itemsSignal(input.loadedItemsCount),
      ]),
    };
  }

  if (input.storyHighlightsCount > 0) {
    return {
      tone: 'story',
      eyebrow: 'الحكايات ظاهرة',
      title: 'في عناصر تتفهم من كلام أصحابها',
      body: 'اكتشف عناصر معها حكاية أو سبب تبديل يقرّبك من قرار أوضح.',
      signals: withFallbackSignal([storiesSignal(input.storyHighlightsCount), itemsSignal(input.loadedItemsCount)]),
    };
  }

  if (input.videoMomentsCount > 0) {
    return {
      tone: 'visual',
      eyebrow: 'الاكتشاف صار أقرب',
      title: 'في عناصر تقدر تشوفها قبل ما تفتحها',
      body: 'اللمحات المرئية تساعدك تدخل التفاصيل وأنت فاهم الشكل أكثر.',
      signals: withFallbackSignal([videoSignal(input.videoMomentsCount), itemsSignal(input.loadedItemsCount)]),
    };
  }

  return {
    tone: 'calm',
    eyebrow: 'تصفح مباشر',
    title: 'المشهد جاهز للاستكشاف',
    body: 'ابدأ بالبحث أو الفلاتر، وكل عنصر أوضح يبان لك أسرع.',
    signals: withFallbackSignal([itemsSignal(input.loadedItemsCount)]),
  };
}

export function buildDiscoverSpotlightItems(items: MarketplaceItem[], limit = 6): MarketplaceItem[] {
  const scored = items
    .map((item, index) => {
      const score =
        (item.hasVideoTeaser ? 5 : 0) +
        (item.description?.trim() ? 3 : 0) +
        (item.imageUrl ? 2 : 0) +
        (item.category?.trim() ? 1 : 0) +
        (item.location?.trim() ? 1 : 0) +
        (item.ownerDisplayName?.trim() ? 1 : 0);
      return { item, score, index, category: item.category?.trim() || null };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));

  const picked: typeof scored = [];
  const categorySet = new Set<string>();

  for (const entry of scored) {
    if (picked.length >= limit) break;
    if (entry.category && categorySet.has(entry.category.toLocaleLowerCase())) continue;
    picked.push(entry);
    if (entry.category) categorySet.add(entry.category.toLocaleLowerCase());
  }

  if (picked.length < limit) {
    for (const entry of scored) {
      if (picked.length >= limit) break;
      if (picked.some((chosen) => chosen.item.id === entry.item.id)) continue;
      picked.push(entry);
    }
  }

  return picked.slice(0, limit).map((entry) => entry.item);
}

