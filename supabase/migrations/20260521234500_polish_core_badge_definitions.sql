-- Polish core badge definition copy/icon/priority while keeping award rules unchanged.

update public.badge_definitions
set
  label_ar = 'أول تبديلة',
  description_ar = 'أول تبديلة ناجحة على تِسوى — بداية سجل ثقة حقيقي.',
  category = 'swap',
  icon_name = 'swap-horizontal-outline',
  priority = 10,
  is_active = true,
  is_manual = false,
  updated_at = now()
where key = 'first_swap';

update public.badge_definitions
set
  label_ar = 'موثوق في التبديل',
  description_ar = 'شارة تظهر لما يكون عندك سجل قوي في التبديل والتواصل.',
  category = 'trust',
  icon_name = 'shield-checkmark-outline',
  priority = 20,
  is_active = true,
  is_manual = false,
  updated_at = now()
where key = 'reliable_swapper';

update public.badge_definitions
set
  label_ar = 'من أوائل مستخدمي تِسوى',
  description_ar = 'انضم لتِسوى في مرحلة البداية وساهم في بناء المجتمع.',
  category = 'early',
  icon_name = 'sparkles-outline',
  priority = 30,
  is_active = true,
  is_manual = true,
  updated_at = now()
where key = 'early_swapper';

update public.badge_definitions
set
  label_ar = 'Founder Badge',
  description_ar = 'شارة خاصة تُمنح يدويًا للحسابات المؤسسة أو الداعمة للبداية.',
  category = 'special',
  icon_name = 'star-outline',
  priority = 40,
  is_active = true,
  is_manual = true,
  updated_at = now()
where key = 'founder_badge';
