import type { ActiveStorySummary } from '@/lib/stories';
import type { ItemVideoDiscoveryMoment } from '@/lib/item-video-discovery';
import { readOfflineJsonCache, writeOfflineJsonCache } from '@/lib/offline-cache';
import { supabase } from '@/lib/supabase/client';

type PersonalLivingWorldLastSeenCache = { seenAtMs: number };

export type PersonalLivingSignalTone = 'attention' | 'messages' | 'stories' | 'video' | 'items' | 'quiet';

export type PersonalLivingSignal = {
  key: string;
  label: string;
  value: number | string;
  icon: string;
  tone: PersonalLivingSignalTone;
};

export type PersonalLivingWorldState = {
  visitLabel: string;
  title: string;
  body: string;
  tone: 'attention' | 'alive' | 'calm' | 'first_visit';
  signals: PersonalLivingSignal[];
  primaryActionLabel: string | null;
  primaryActionRoute: string | null;
};

const buildLastSeenKey = (userId: string) => `home:personal-living-world:last-seen:v1:${userId}`;

function isValidMs(value: number | null | undefined): value is number {
  return Number.isFinite(value) && Number(value) > 0;
}

export async function readPersonalLivingWorldLastSeen(userId: string): Promise<number | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const cached = await readOfflineJsonCache<PersonalLivingWorldLastSeenCache>({
    key: buildLastSeenKey(normalizedUserId),
    allowExpired: true,
  });

  const seenAtMs = cached?.value?.seenAtMs;
  return isValidMs(seenAtMs) ? seenAtMs : null;
}

export async function writePersonalLivingWorldLastSeen(userId: string, seenAtMs = Date.now()): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || !isValidMs(seenAtMs)) return;

  await writeOfflineJsonCache({
    key: buildLastSeenKey(normalizedUserId),
    value: { seenAtMs },
  });
}

export async function fetchNewMarketplaceItemsCountSince(lastSeenAtMs: number | null): Promise<number | null> {
  if (!isValidMs(lastSeenAtMs)) return 0;

  const sinceIso = new Date(lastSeenAtMs).toISOString();
  const { count, error } = await supabase
    .from('marketplace_items')
    .select('id', { head: true, count: 'exact' })
    .gt('created_at', sinceIso);

  if (error) return null;
  return count ?? 0;
}

export function countActiveStoriesSince(stories: ActiveStorySummary[], lastSeenAtMs: number | null): number {
  if (!isValidMs(lastSeenAtMs)) return 0;

  return stories
    .flatMap((summary) => summary.stories)
    .reduce((count, story) => (Date.parse(story.createdAt) > lastSeenAtMs ? count + 1 : count), 0);
}

export function countVideoMomentsSince(moments: ItemVideoDiscoveryMoment[], lastSeenAtMs: number | null): number {
  if (!isValidMs(lastSeenAtMs)) return 0;

  return moments.reduce((count, moment) => (Date.parse(moment.videoCreatedAt ?? '') > lastSeenAtMs ? count + 1 : count), 0);
}

export function buildPersonalLivingWorldState(input: {
  lastSeenAtMs: number | null;
  actionableOffersCount: number;
  unreadDealMessagesCount: number;
  unreadContextualMessagesCount: number;
  newActiveStoriesCount: number;
  newVideoMomentsCount: number;
  newMarketplaceItemsCount: number | null;
}): PersonalLivingWorldState {
  const hasLastSeen = isValidMs(input.lastSeenAtMs);
  const hasWorldActivity =
    input.newActiveStoriesCount > 0 || input.newVideoMomentsCount > 0 || (input.newMarketplaceItemsCount ?? 0) > 0;

  const signals: PersonalLivingSignal[] = [];
  if (input.actionableOffersCount > 0) {
    signals.push({ key: 'offers', label: 'عروض تحتاج ردك', value: input.actionableOffersCount, icon: 'swap-horizontal-outline', tone: 'attention' });
  }
  if (input.unreadDealMessagesCount > 0) {
    signals.push({ key: 'deal_messages', label: 'رسائل صفقات', value: input.unreadDealMessagesCount, icon: 'chatbubble-ellipses-outline', tone: 'messages' });
  }
  if (input.unreadContextualMessagesCount > 0) {
    signals.push({ key: 'story_replies', label: 'ردود قصص', value: input.unreadContextualMessagesCount, icon: 'sparkles-outline', tone: 'messages' });
  }
  if (input.newActiveStoriesCount > 0) {
    signals.push({ key: 'stories', label: 'قصص جديدة', value: input.newActiveStoriesCount, icon: 'book-outline', tone: 'stories' });
  }
  if (input.newVideoMomentsCount > 0) {
    signals.push({ key: 'video', label: 'لمحات مرئية', value: input.newVideoMomentsCount, icon: 'videocam-outline', tone: 'video' });
  }
  if ((input.newMarketplaceItemsCount ?? 0) > 0) {
    signals.push({ key: 'items', label: 'عناصر جديدة', value: input.newMarketplaceItemsCount as number, icon: 'cube-outline', tone: 'items' });
  }

  if (signals.length === 0) {
    signals.push({ key: 'quiet', label: 'كل شيء هادئ', value: 'الآن', icon: 'pulse-outline', tone: 'quiet' });
  }

  if (input.actionableOffersCount > 0) {
    return {
      visitLabel: hasLastSeen ? 'من آخر مرة فتحت' : 'عالمك الآن',
      title: 'في قرار مستنيك',
      body: hasWorldActivity ? 'في عروض محتاجة ردك، وكمان عالم تِسوى اتحرك حواليك من آخر زيارة.' : 'في عروض محتاجة ردك، وقرارك هو الخطوة الأهم الآن.',
      tone: 'attention',
      signals,
      primaryActionLabel: 'افتح الرسائل والعروض',
      primaryActionRoute: '/(tabs)/messages',
    };
  }

  if (input.unreadDealMessagesCount > 0 || input.unreadContextualMessagesCount > 0) {
    const body =
      input.unreadDealMessagesCount > 0 && input.unreadContextualMessagesCount > 0
        ? 'عندك رسائل صفقات جديدة وردود على القصص مستنياك.'
        : input.unreadDealMessagesCount > 0
          ? 'عندك رسائل صفقات جديدة مستنياك.'
          : 'عندك ردود جديدة على القصص مستنياك.';

    return {
      visitLabel: hasLastSeen ? 'من آخر مرة فتحت' : 'عالمك الآن',
      title: 'في كلام جديد مستنيك',
      body,
      tone: 'attention',
      signals,
      primaryActionLabel: 'افتح الرسائل',
      primaryActionRoute: '/(tabs)/messages',
    };
  }

  if (hasWorldActivity) {
    const categories: string[] = [];
    if (input.newActiveStoriesCount > 0) categories.push('قصص');
    if (input.newVideoMomentsCount > 0) categories.push('لمحات');
    if ((input.newMarketplaceItemsCount ?? 0) > 0) categories.push('عناصر');

    return {
      visitLabel: hasLastSeen ? 'من آخر مرة فتحت' : 'عالمك الآن',
      title: 'في جديد من آخر زيارة',
      body: `${categories.join('، ')} جديدة اتحركت في تِسوى.`,
      tone: 'alive',
      signals,
      primaryActionLabel: input.newVideoMomentsCount > 0 ? 'شوف المشاهد' : input.newActiveStoriesCount > 0 ? 'ادخل الحركة' : 'استكشف الجديد',
      primaryActionRoute: input.newVideoMomentsCount > 0 ? '/motion/viewer' : input.newActiveStoriesCount > 0 ? '/motion' : '/(tabs)/discover',
    };
  }

  if (!hasLastSeen) {
    return {
      visitLabel: 'نبدأ من هنا',
      title: 'بنرسم عالمك في تِسوى',
      body: 'مع أول عروض ورسائل وحكايات جديدة، هنلخّص لك المشهد هنا.',
      tone: 'first_visit',
      signals,
      primaryActionLabel: 'ادخل الحركة',
      primaryActionRoute: '/motion',
    };
  }

  return {
    visitLabel: 'من آخر مرة فتحت',
    title: 'عالمك هادي الآن',
    body: 'مفيش شيء عاجل مستنيك، لكن النبض مستمر حوالينك.',
    tone: 'calm',
    signals,
    primaryActionLabel: 'شوف الحركة',
    primaryActionRoute: '/motion',
  };
}
