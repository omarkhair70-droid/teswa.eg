import { teswaBackendRuntime } from '@/lib/backend/runtime';
import { supabase } from '@/lib/supabase/client';

export type DirectPrivacySetting = 'everyone' | 'followers_only' | 'no_one';

const VALID_SETTINGS: DirectPrivacySetting[] = ['everyone', 'followers_only', 'no_one'];

function normalizeSetting(value: unknown): DirectPrivacySetting {
  if (typeof value === 'string' && VALID_SETTINGS.includes(value as DirectPrivacySetting)) {
    return value as DirectPrivacySetting;
  }
  return 'everyone';
}

export async function fetchDirectPrivacySetting(): Promise<{ ok: true; value: DirectPrivacySetting } | { ok: false; message: string }> {
  let userId: string | null = null;
  try {
    userId = (await teswaBackendRuntime.auth.getCurrentUser())?.id ?? null;
  } catch {}
  if (!userId) return { ok: false, message: 'لازم تسجل دخول الأول.' };

  const { data, error } = await supabase
    .from('profiles')
    .select('direct_message_privacy')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { ok: false, message: 'تعذر تحميل خصوصية الرسائل حالياً.' };

  return { ok: true, value: normalizeSetting(data?.direct_message_privacy) };
}

export async function updateDirectPrivacySetting(value: DirectPrivacySetting): Promise<{ ok: true } | { ok: false; message: string }> {
  let userId: string | null = null;
  try {
    userId = (await teswaBackendRuntime.auth.getCurrentUser())?.id ?? null;
  } catch {}
  if (!userId) return { ok: false, message: 'لازم تسجل دخول الأول.' };

  const { error } = await supabase
    .from('profiles')
    .update({ direct_message_privacy: value })
    .eq('id', userId);

  if (error) return { ok: false, message: 'تعذر تحديث خصوصية الرسائل حالياً.' };

  return { ok: true };
}
