const CONDITION_LABELS: Record<string, string> = {
  almost_new: 'شبه جديد',
  good_used: 'مستعمل بحالة جيدة',
  minor_issues: 'به ملاحظات بسيطة',
  needs_repair: 'يحتاج إصلاح',
};

export function getItemConditionLabel(condition: string | null | undefined): string | null {
  const normalized = condition?.trim();
  if (!normalized) return null;
  return CONDITION_LABELS[normalized] ?? normalized.replaceAll('_', ' ');
}
