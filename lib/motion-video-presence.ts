import type { MotionVideoDrop } from '@/lib/motion-video-drops';

export type MotionVideoPresence = {
  hasDrops: boolean;
  count: number;
  latestAgeLabel: string | null;
  heroSummary: string | null;
  pulseSummary: string | null;
};

const buildLatestAgeLabel = (createdAtValues: string[]) => {
  const latestTimestamp = createdAtValues.reduce<number | null>((latest, value) => {
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) return latest;
    if (latest === null || ts > latest) return ts;
    return latest;
  }, null);

  if (latestTimestamp === null) return null;

  const diffMs = Math.max(0, Date.now() - latestTimestamp);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'الآن';
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  return 'اليوم';
};

export function buildMotionVideoPresence(drops: MotionVideoDrop[]): MotionVideoPresence {
  if (drops.length === 0) {
    return {
      hasDrops: false,
      count: 0,
      latestAgeLabel: null,
      heroSummary: null,
      pulseSummary: null,
    };
  }

  const count = drops.length;
  const latestAgeLabel = buildLatestAgeLabel(drops.map((drop) => drop.createdAt));

  const baseHeroSummary = count === 1
    ? 'لقطة فيديو نشطة تفتح المشهد بصريًا'
    : `${count} لقطات فيديو نشطة تفتح المشهد بصريًا`;

  const heroSummary = latestAgeLabel
    ? `${baseHeroSummary} • أحدثها ${latestAgeLabel}`
    : baseHeroSummary;

  const pulseSummary = count === 1
    ? 'الفيديو حاضر داخل النبض الحالي، مع لقطة قصيرة من القصص النشطة.'
    : `الفيديو حاضر داخل النبض الحالي عبر ${count} لقطات قصيرة من القصص النشطة.`;

  return {
    hasDrops: true,
    count,
    latestAgeLabel,
    heroSummary,
    pulseSummary,
  };
}
