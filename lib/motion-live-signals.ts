export type MotionLiveSignalTone =
  | 'video'
  | 'stories'
  | 'moving'
  | 'stories_items';

export type MotionLiveSignal = {
  key: string;
  label: string;
  value: number | string;
  tone?: MotionLiveSignalTone;
};

export type MotionLiveSignalsState = {
  moodLabel: string;
  moodBody: string;
  signals: MotionLiveSignal[];
};

type BuildMotionLiveSignalsInput = {
  storiesCount: number;
  movingCount: number;
  storyItemsCount: number;
  videoDropsCount: number;
};

export function buildMotionLiveSignals({
  storiesCount,
  movingCount,
  storyItemsCount,
  videoDropsCount,
}: BuildMotionLiveSignalsInput): MotionLiveSignalsState {
  const mood = (() => {
    if (videoDropsCount > 0 && (storiesCount > 0 || storyItemsCount > 0)) {
      return {
        moodLabel: 'النبض صاحي',
        moodBody: 'قصص وفيديوهات بتفتح المشهد في تِسوى الآن.',
      };
    }

    if (movingCount > 0) {
      return {
        moodLabel: 'الحركة بدأت',
        moodBody: 'أبواب تبادل دخلت المشهد وبتشد الانتباه.',
      };
    }

    if (storiesCount > 0 || storyItemsCount > 0) {
      return {
        moodLabel: 'الحكايات ظاهرة',
        moodBody: 'ناس بدأت تحكي، والنبض بيتكوّن بهدوء.',
      };
    }

    return {
      moodLabel: 'المشهد لسه هادي',
      moodBody: 'أول حركة جديدة هتظهر هنا بمجرد ما تبدأ.',
    };
  })();

  return {
    ...mood,
    signals: [
      {
        key: 'video-drops',
        label: 'فيديوهات نشطة',
        value: videoDropsCount,
        tone: 'video',
      },
      {
        key: 'stories',
        label: 'قصص الآن',
        value: storiesCount,
        tone: 'stories',
      },
      {
        key: 'moving',
        label: 'أبواب تتحرك',
        value: movingCount,
        tone: 'moving',
      },
      {
        key: 'story-items',
        label: 'حكايات',
        value: storyItemsCount,
        tone: 'stories_items',
      },
    ],
  };
}
