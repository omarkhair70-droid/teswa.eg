import { supabase } from '@/lib/supabase/client';

export type AdminCheckResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; message: string };

export async function checkIsAdminUser(): Promise<AdminCheckResult> {
  const { data, error } = await supabase.rpc('is_admin_user');

  if (error) {
    return { ok: false, message: 'تعذر التحقق من صلاحيات الإدارة حالياً.' };
  }

  return { ok: true, isAdmin: data === true };
}
