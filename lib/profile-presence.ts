export type ProfilePresenceTone = 'stories' | 'items' | 'trust' | 'reply';

export type ProfilePresenceSignal = {
  key: string;
  label: string;
  value: string | number;
  tone?: ProfilePresenceTone;
};

export type ProfilePresenceState = {
  headline: string;
  body: string;
  signals: ProfilePresenceSignal[];
};

type BuildProfilePresenceInput = {
  activeStoriesCount: number;
  listingsCount?: number;
  successfulSwapsCount?: number;
  responseRate?: number | null;
  variant: 'self' | 'public';
};

const formatCount = (value: number, singular: string, plural: string) => (value === 1 ? singular : `${value} ${plural}`);

export function buildProfilePresence(input: BuildProfilePresenceInput): ProfilePresenceState {
  const activeStoriesCount = Math.max(0, input.activeStoriesCount || 0);
  const listingsCount = input.listingsCount == null ? null : Math.max(0, input.listingsCount);
  const successfulSwapsCount = Math.max(0, input.successfulSwapsCount ?? 0);
  const responseRate = input.responseRate;
  const isSelf = input.variant === 'self';

  const signals: ProfilePresenceSignal[] = [];

  if (activeStoriesCount > 0) {
    signals.push({
      key: 'stories',
      label: 'حضور حي',
      value: formatCount(activeStoriesCount, 'قصة نشطة', 'قصص نشطة'),
      tone: 'stories',
    });
  }

  if (listingsCount != null && listingsCount > 0) {
    signals.push({
      key: 'items',
      label: 'عناصر في المشهد',
      value: listingsCount,
      tone: 'items',
    });
  }

  signals.push({
    key: 'trust',
    label: 'مقايضات ناجحة',
    value: successfulSwapsCount,
    tone: 'trust',
  });

  if (responseRate != null) {
    signals.push({
      key: 'reply',
      label: 'معدل الرد',
      value: `${responseRate}%`,
      tone: 'reply',
    });
  }

  if (activeStoriesCount > 0 && listingsCount != null && listingsCount > 0) {
    return {
      headline: isSelf ? 'ملفك حاضر في عالم تِسوى الآن' : 'حضور واضح في عالم تِسوى الآن',
      body: isSelf
        ? 'قصصك وعناصرك النشطة تعطي ملفك إحساسًا حيًا وتساعد الآخرين يفهموا ذوقك بسرعة.'
        : 'القصص والعناصر النشطة ترسم صورة قريبة عن هذا الشخص وما يشاركه في تِسوى.',
      signals,
    };
  }

  if (activeStoriesCount > 0) {
    return {
      headline: isSelf ? 'لديك حضور حي الآن' : 'هناك حضور حي الآن',
      body: isSelf
        ? 'قصصك النشطة تضيف نبضًا شخصيًا لملفك وتفتح نافذة سريعة على يومك.'
        : 'القصص النشطة تضيف لمحة إنسانية سريعة قبل بدء أي تواصل.',
      signals,
    };
  }

  if (listingsCount != null && listingsCount > 0) {
    return {
      headline: isSelf ? 'عناصرك تبني المشهد' : 'عناصر نشطة تبني المشهد',
      body: isSelf
        ? 'العناصر المعروضة تمنح ملفك حضورًا واضحًا حتى قبل إضافة قصة جديدة.'
        : 'العناصر النشطة تساعد على فهم ما يقدمه هذا الملف داخل مجتمع تِسوى.',
      signals,
    };
  }

  return {
    headline: isSelf ? 'ملفك جاهز ليستقبل لحظته القادمة' : 'ملف هادئ وجاهز للتواصل',
    body: isSelf
      ? 'أضف قصة أو حدّث عناصرَك وقت ما تحب ليظهر ملفك بإحساس أكثر حياة.'
      : 'لا توجد إشارات نشطة الآن، لكن بيانات الملف الأساسية تساعد على بدء تواصل واضح ومحترم.',
    signals,
  };
}
