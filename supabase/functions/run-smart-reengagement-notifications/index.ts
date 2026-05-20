import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SmartType = "reminder_offer_response_needed" | "reminder_deal_coordination_needed" | "reminder_deal_confirmation_pending" | "reminder_unread_deal_message" | "reminder_unread_contextual_message" | "nudge_listing_refresh_or_media" | "digest_local_activity_pulse" | "nudge_return_to_teswa";
const PUSH_TYPES = new Set<SmartType>(["reminder_offer_response_needed","reminder_deal_coordination_needed","reminder_deal_confirmation_pending","reminder_unread_deal_message","reminder_unread_contextual_message","nudge_listing_refresh_or_media","digest_local_activity_pulse","nudge_return_to_teswa"]);
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  const secret = Deno.env.get("TESWA_SMART_NOTIFICATION_JOB_SECRET");
  if (!secret || req.headers.get("x-teswa-smart-job-secret") !== secret) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const counts: Record<string, number> = {}; const skipped: Record<string, number> = {}; const errors: string[] = [];
  const start = new Date(now); start.setUTCHours(0,0,0,0);

  async function isUserCapped(userId: string) {
    const { count } = await db.from("smart_notification_dispatches").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("sent_at", start.toISOString());
    return (count ?? 0) >= 4;
  }
  async function canSend(userId: string, pref: "reminders"|"discovery_digest"|"return_nudges", dedupeKey: string) {
    const { data: existing } = await db.from("smart_notification_dispatches").select("id").eq("dedupe_key", dedupeKey).maybeSingle();
    if (existing) { skipped.dedupe = (skipped.dedupe ?? 0) + 1; return false; }
    if (await isUserCapped(userId)) { skipped.daily_cap = (skipped.daily_cap ?? 0) + 1; return false; }
    const { data: prefRow } = await db.from("notification_preferences").select("reminders_enabled,discovery_digest_enabled,return_nudges_enabled").eq("user_id", userId).maybeSingle();
    if ((pref === "reminders" && prefRow?.reminders_enabled === false) || (pref === "discovery_digest" && prefRow?.discovery_digest_enabled === false) || (pref === "return_nudges" && prefRow?.return_nudges_enabled === false)) { skipped.preferences = (skipped.preferences ?? 0) + 1; return false; }
    return true;
  }
  async function emit(v: { userId: string; type: SmartType; title: string; body: string; pref: "reminders"|"discovery_digest"|"return_nudges"; dedupeKey: string; dealId?: string; offerId?: string; itemId?: string; contextualId?: string; entityType?: string; entityId?: string; route?: string; }) {
    if (!(await canSend(v.userId, v.pref, v.dedupeKey))) return;
    await db.from("notifications").insert({ user_id: v.userId, type: v.type, title: v.title, body: v.body, deal_id: v.dealId ?? null, offer_id: v.offerId ?? null, item_id: v.itemId ?? null, contextual_conversation_id: v.contextualId ?? null });
    await db.from("smart_notification_dispatches").insert({ user_id: v.userId, notification_type: v.type, preference_category: v.pref, entity_type: v.entityType ?? null, entity_id: v.entityId ?? null, dedupe_key: v.dedupeKey, metadata: { route: v.route ?? null, pushEligible: PUSH_TYPES.has(v.type) } });
    counts[v.type] = (counts[v.type] ?? 0) + 1;
  }
  try {
    const iso12 = new Date(now.getTime() - 12 * 3600_000).toISOString();
    const { data: offers } = await db.from("offers").select("id,receiver_id").in("status", ["pending", "thinking"]).lte("created_at", iso12).limit(200);
    for (const o of offers ?? []) await emit({ userId: o.receiver_id, type: "reminder_offer_response_needed", title: "عندك عرض مستني قرارك", body: "لو مناسب لك، احسم العرض عشان المقايضة ما توقف.", pref: "reminders", dedupeKey: `offer:${o.id}:${day}`, offerId: o.id, entityType: "offer", entityId: o.id, route: `/offer/${o.id}` });
  } catch (e) { errors.push(`offer_response:${String(e)}`); }

  return new Response(JSON.stringify({ ok: true, counts, skipped, errors }), { headers: { "Content-Type": "application/json" } });
});
