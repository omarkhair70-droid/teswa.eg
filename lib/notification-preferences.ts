import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

export type NotificationPreferences = {
  userId: string;
  transactionalEnabled: boolean;
  remindersEnabled: boolean;
  discoveryDigestEnabled: boolean;
  returnNudgesEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: any): NotificationPreferences {
  return {
    userId: row.user_id,
    transactionalEnabled: Boolean(row.transactional_enabled),
    remindersEnabled: Boolean(row.reminders_enabled),
    discoveryDigestEnabled: Boolean(row.discovery_digest_enabled),
    returnNudgesEnabled: Boolean(row.return_nudges_enabled),
    quietHoursStart: typeof row.quiet_hours_start === 'number' ? row.quiet_hours_start : null,
    quietHoursEnd: typeof row.quiet_hours_end === 'number' ? row.quiet_hours_end : null,
    timezone: typeof row.timezone === 'string' ? row.timezone : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateNotificationPreferences(): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_or_create_notification_preferences');
  if (error || !data) return { ok: false, error };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapRow(row) };
}

export async function updateMyNotificationPreferences(input: Partial<Pick<NotificationPreferences, 'transactionalEnabled' | 'remindersEnabled' | 'discoveryDigestEnabled' | 'returnNudgesEnabled' | 'quietHoursStart' | 'quietHoursEnd' | 'timezone'>>): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; error: PostgrestError | null }> {
  const payload: Record<string, unknown> = {};
  if (typeof input.transactionalEnabled === 'boolean') payload.transactional_enabled = input.transactionalEnabled;
  if (typeof input.remindersEnabled === 'boolean') payload.reminders_enabled = input.remindersEnabled;
  if (typeof input.discoveryDigestEnabled === 'boolean') payload.discovery_digest_enabled = input.discoveryDigestEnabled;
  if (typeof input.returnNudgesEnabled === 'boolean') payload.return_nudges_enabled = input.returnNudgesEnabled;
  if (input.quietHoursStart === null || typeof input.quietHoursStart === 'number') payload.quiet_hours_start = input.quietHoursStart;
  if (input.quietHoursEnd === null || typeof input.quietHoursEnd === 'number') payload.quiet_hours_end = input.quietHoursEnd;
  if (input.timezone === null || typeof input.timezone === 'string') payload.timezone = input.timezone;

  const ensured = await getOrCreateNotificationPreferences();
  if (!ensured.ok) return ensured;

  const userId = ensured.data.userId;

  if (!Object.keys(payload).length) return ensured;

  const { data, error } = await supabase
    .from('notification_preferences')
    .update(payload)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return { ok: false, error };
  return { ok: true, data: mapRow(data) };
}
