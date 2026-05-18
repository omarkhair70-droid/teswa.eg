import type { CityPulseSnapshot } from '@/lib/city-pulse';

export type CityPulseSignalTone =
  | 'movement'
  | 'stories'
  | 'people'
  | 'quiet';

export type CityPulseSignal = {
  id: string;
  tone: CityPulseSignalTone;
  title: string;
  body: string;
};

export type CityPulseHeroState = {
  tone: CityPulseSignalTone;
  headline: string;
  body: string;
};

function formatArabicRelativeAge(timestamp: string): string {
  const diffMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'الآن';

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;

  if (diffMs < minuteMs) return 'الآن';
  if (diffMs < hourMs) return `منذ ${Math.floor(diffMs / minuteMs)} دقيقة`;
  if (diffMs < 24 * hourMs) return `منذ ${Math.floor(diffMs / hourMs)} ساعة`;
  return 'اليوم';
}

export function buildCityPulseHeroState(
  snapshot: CityPulseSnapshot,
): CityPulseHeroState {
  const hasMoving = snapshot.movingItems.length > 0;
  const hasStories = snapshot.activeStoryAuthors.length > 0 || snapshot.storyItems.length > 0;
  const hasPeople = snapshot.people.length > 0;

  if (hasMoving && hasStories) {
    return {
      tone: 'movement',
      headline: 'الحركة ظاهرة حوالك',
      body: 'أبواب، قصص، وناس قريبين بيشكلوا مشهدًا محليًا حيًا.',
    };
  }

  if (hasMoving) {
    return {
      tone: 'movement',
      headline: 'أبواب التبادل بدأت تتحرك',
      body: 'اقتراحات قريبة تظهر الآن وتفتح مسارات تبادل جديدة في محيطك.',
    };
  }

  if (hasStories) {
    return {
      tone: 'stories',
      headline: 'القصص شغالة في مدينتك',
      body: 'أصوات وحكايات قريبة تضيف طبقة إنسانية لمشهد تِسوى المحلي.',
    };
  }

  if (hasPeople) {
    return {
      tone: 'people',
      headline: 'في ناس قريبة من عالم تِسوى',
      body: 'أشخاص من نفس النبض المحلي يظهرون حولك لتكتشف حضورهم ومعروضاتهم.',
    };
  }

  return {
    tone: 'quiet',
    headline: 'المشهد هادي الآن',
    body: 'أول حركة محلية جديدة ستظهر هنا فورًا.',
  };
}

export function buildCityPulseSignals(
  snapshot: CityPulseSnapshot,
): CityPulseSignal[] {
  const signals: CityPulseSignal[] = [];

  if (snapshot.movingItems.length > 0) {
    const totalOpenInterest = snapshot.movingItems.reduce(
      (sum, item) => sum + item.openInterestCount,
      0,
    );

    if (totalOpenInterest >= 3) {
      signals.push({
        id: 'moving-strong',
        tone: 'movement',
        title: 'الحركة واضحة هنا',
        body: `في ${snapshot.movingItems.length} أبواب قريبة عليها ${totalOpenInterest} اقتراحات تبادل مفتوحة.`,
      });
    } else {
      signals.push({
        id: 'moving-started',
        tone: 'movement',
        title: 'في أبواب بدأت تتحرك',
        body: `لقينا ${snapshot.movingItems.length} عناصر قريبة بدأت تستقبل اهتمامًا.`,
      });
    }
  }

  if (snapshot.activeStoryAuthors.length > 0) {
    const newestStoryAt = snapshot.activeStoryAuthors.reduce((latest, entry) =>
      Date.parse(entry.latestCreatedAt) > Date.parse(latest)
        ? entry.latestCreatedAt
        : latest,
    snapshot.activeStoryAuthors[0].latestCreatedAt);

    const ageLabel = formatArabicRelativeAge(newestStoryAt);

    signals.push({
      id: 'stories-active',
      tone: 'stories',
      title: 'القصص شغالة في النبض',
      body: `في ${snapshot.activeStoryAuthors.length} أصوات قريبة نشرت قصصًا، أحدثها ${ageLabel}.`,
    });
  }

  if (snapshot.people.length > 0) {
    const activePeopleCount = snapshot.people.filter((person) => person.activeItemsCount > 0).length;

    if (activePeopleCount > 0) {
      signals.push({
        id: 'people-active-items',
        tone: 'people',
        title: 'ناس ومعروضات في نفس المشهد',
        body: `${activePeopleCount} من الناس القريبة لديهم عناصر نشطة الآن.`,
      });
    } else {
      signals.push({
        id: 'people-nearby',
        tone: 'people',
        title: 'في ناس قريبة من عالم تِسوى',
        body: `ظهر ${snapshot.people.length} أشخاص داخل نفس النبض المحلي.`,
      });
    }
  }

  if (signals.length < 3 && snapshot.storyItems.length > 0) {
    signals.push({
      id: 'story-items',
      tone: 'stories',
      title: 'الحكايات موجودة حولك',
      body: `في ${snapshot.storyItems.length} عناصر قريبة لها سبب أو حكاية تستحق الاكتشاف.`,
    });
  }

  if (!signals.length) {
    signals.push({
      id: 'quiet-fallback',
      tone: 'quiet',
      title: 'النبض هادي هنا الآن',
      body: 'لسه الحركة المحلية قليلة، لكن تِسوى يراقب المشهد ويحدّثه كلما ظهر شيء جديد.',
    });
  }

  return signals.slice(0, 3);
}
