import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SmartType =
  | "reminder_offer_response_needed"
  | "reminder_deal_coordination_needed"
  | "reminder_deal_confirmation_pending"
  | "reminder_unread_deal_message"
  | "reminder_unread_contextual_message"
  | "nudge_listing_refresh_or_media"
  | "digest_local_activity_pulse"
  | "nudge_return_to_teswa";

type PrefCategory = "reminders" | "discovery_digest" | "return_nudges";

type Candidate = {
  userId: string;
  type: SmartType;
  title: string;
  body: string;
  prefCategory: PrefCategory;
  dedupeKey: string;
  dealId?: string;
  offerId?: string;
  itemId?: string;
  contextualConversationId?: string;
  entityType?: string;
  entityId?: string;
  route?: string;
};

const DAILY_CAP = 4;

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function isWithinQuietHours(now: Date, timezone: string | null, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  let mins: number;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = fmt.formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    mins = h * 60 + m;
  } catch {
    const h = now.getUTCHours();
    mins = h * 60 + now.getUTCMinutes();
  }
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const expectedSecret = Deno.env.get("TESWA_SMART_NOTIFICATION_JOB_SECRET");
  if (!expectedSecret || req.headers.get("x-teswa-smart-job-secret") !== expectedSecret) return json(401, { ok: false, error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json(500, { ok: false, error: "server_misconfigured" });
  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const sentByType: Record<string, number> = {};
  const skipped = { dedupe: 0, cap: 0, preferences: 0, quietHours: 0 };
  const failures: Record<string, number> = {};

  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);

  const prefCache = new Map<string, any>();
  const dailyCountCache = new Map<string, number>();

  const bumpFail = (k: string) => { failures[k] = (failures[k] ?? 0) + 1; };

  async function getPrefs(userId: string) {
    if (prefCache.has(userId)) return prefCache.get(userId);
    const { data, error } = await db.from("notification_preferences").select("reminders_enabled,discovery_digest_enabled,return_nudges_enabled,quiet_hours_start,quiet_hours_end,timezone").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`pref_query_failed:${error.message}`);
    const pref = data ?? { reminders_enabled: true, discovery_digest_enabled: true, return_nudges_enabled: true, quiet_hours_start: null, quiet_hours_end: null, timezone: "UTC" };
    prefCache.set(userId, pref);
    return pref;
  }

  async function canSend(candidate: Candidate): Promise<boolean> {
    const pref = await getPrefs(candidate.userId);
    if ((candidate.prefCategory === "reminders" && pref.reminders_enabled === false) || (candidate.prefCategory === "discovery_digest" && pref.discovery_digest_enabled === false) || (candidate.prefCategory === "return_nudges" && pref.return_nudges_enabled === false)) {
      skipped.preferences += 1;
      return false;
    }
    if (isWithinQuietHours(now, pref.timezone ?? "UTC", pref.quiet_hours_start, pref.quiet_hours_end)) {
      skipped.quietHours += 1;
      return false;
    }

    if (!dailyCountCache.has(candidate.userId)) {
      const { count, error } = await db.from("smart_notification_dispatches").select("id", { count: "exact", head: true }).eq("user_id", candidate.userId).eq("status", "sent").gte("sent_at", dayStart.toISOString());
      if (error) throw new Error(`daily_cap_query_failed:${error.message}`);
      dailyCountCache.set(candidate.userId, count ?? 0);
    }
    if ((dailyCountCache.get(candidate.userId) ?? 0) >= DAILY_CAP) {
      skipped.cap += 1;
      return false;
    }
    return true;
  }

  async function reserveAndSend(c: Candidate) {
    if (!(await canSend(c))) return;

    const { data: reservation, error: reserveError } = await db
      .from("smart_notification_dispatches")
      .insert({ user_id: c.userId, notification_type: c.type, preference_category: c.prefCategory, entity_type: c.entityType ?? null, entity_id: c.entityId ?? null, dedupe_key: c.dedupeKey, metadata: { route: c.route ?? null }, status: "reserved" })
      .select("id")
      .single();

    if (reserveError) {
      if (reserveError.code === "23505") {
        skipped.dedupe += 1;
        return;
      }
      throw new Error(`reservation_failed:${reserveError.message}`);
    }

    const { data: notification, error: notifError } = await db
      .from("notifications")
      .insert({ user_id: c.userId, type: c.type, title: c.title, body: c.body, deal_id: c.dealId ?? null, offer_id: c.offerId ?? null, item_id: c.itemId ?? null, contextual_conversation_id: c.contextualConversationId ?? null })
      .select("id")
      .single();

    if (notifError || !notification?.id) {
      await db.from("smart_notification_dispatches").update({ status: "failed", failure_reason: notifError?.message ?? "notification_insert_failed" }).eq("id", reservation.id);
      throw new Error(`notification_insert_failed:${notifError?.message ?? "unknown"}`);
    }

    const { error: finalizeError } = await db.from("smart_notification_dispatches").update({ status: "sent", notification_id: notification.id }).eq("id", reservation.id);
    if (finalizeError) {
      throw new Error(`dispatch_finalize_failed:${finalizeError.message}`);
    }

    dailyCountCache.set(c.userId, (dailyCountCache.get(c.userId) ?? 0) + 1);
    sentByType[c.type] = (sentByType[c.type] ?? 0) + 1;
  }

  try {
    const iso12h = new Date(now.getTime() - 12 * 3600_000).toISOString();
    const { data, error } = await db.from("offers").select("id,receiver_id").in("status", ["pending", "thinking"]).lte("created_at", iso12h).limit(300);
    if (error) throw new Error(error.message);
    for (const offer of data ?? []) await reserveAndSend({ userId: offer.receiver_id, type: "reminder_offer_response_needed", title: "عندك عرض مستني قرارك", body: "لو مناسب لك، احسم العرض عشان المقايضة ما توقف.", prefCategory: "reminders", dedupeKey: `offer_response:${offer.id}:${day}`, offerId: offer.id, entityType: "offer", entityId: offer.id, route: `/offer/${offer.id}` });
  } catch (e) { bumpFail(`reminder_offer_response_needed:${String(e)}`); }

  try {
    const iso24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { data: deals, error } = await db.from("swap_deals").select("id,requester_id,offerer_id,created_at").eq("status", "coordinating").lte("created_at", iso24h).limit(300);
    if (error) throw new Error(error.message);
    for (const d of deals ?? []) {
      const { data: latestMessage, error: msgErr } = await db.from("deal_messages").select("created_at").eq("deal_id", d.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (msgErr) throw new Error(msgErr.message);
      const last = latestMessage?.created_at ?? d.created_at;
      if (last && last > iso24h) continue;
      for (const uid of [d.requester_id, d.offerer_id]) {
        await reserveAndSend({ userId: uid, type: "reminder_deal_coordination_needed", title: "الصفقة لسه فاتحة بابها", body: "كمّلوا التنسيق عشان توصلوا لإتمام المقايضة.", prefCategory: "reminders", dedupeKey: `deal_coordination:${d.id}:${uid}:${day}`, dealId: d.id, entityType: "deal", entityId: d.id, route: `/deal/${d.id}` });
      }
    }
  } catch (e) { bumpFail(`reminder_deal_coordination_needed:${String(e)}`); }

  try {
    const { data: deals, error } = await db.from("swap_deals").select("id,requester_id,offerer_id").eq("status", "completed_pending_confirmation").limit(300);
    if (error) throw new Error(error.message);
    for (const d of deals ?? []) {
      const { data: confs, error: cErr } = await db.from("deal_confirmations").select("user_id").eq("deal_id", d.id);
      if (cErr) throw new Error(cErr.message);
      const confirmed = new Set((confs ?? []).map((r) => r.user_id));
      for (const uid of [d.requester_id, d.offerer_id]) if (!confirmed.has(uid)) await reserveAndSend({ userId: uid, type: "reminder_deal_confirmation_pending", title: "الصفقة مستنية تأكيدك", body: "الطرف التاني أكد الإتمام. أكّد أنت كمان لإغلاق الصفقة.", prefCategory: "reminders", dedupeKey: `deal_confirmation:${d.id}:${uid}:${day}`, dealId: d.id, entityType: "deal", entityId: d.id, route: `/deal/${d.id}` });
    }
  } catch (e) { bumpFail(`reminder_deal_confirmation_pending:${String(e)}`); }

  try {
    const iso6h = new Date(now.getTime() - 6 * 3600_000).toISOString();
    const { data, error } = await db.from("notifications").select("id,user_id,deal_id,created_at").eq("type", "deal_message_received").is("read_at", null).not("deal_id", "is", null).lte("created_at", iso6h).limit(300);
    if (error) throw new Error(error.message);
    for (const n of data ?? []) await reserveAndSend({ userId: n.user_id, type: "reminder_unread_deal_message", title: "لسه في رسالة صفقة مستنياك", body: "في رسالة ما اتقرتش في دردشة الصفقة. الرد السريع بيساعد التنسيق.", prefCategory: "reminders", dedupeKey: `unread_deal:${n.deal_id}:${n.user_id}:${day}`, dealId: n.deal_id, entityType: "deal", entityId: n.deal_id, route: `/deal/${n.deal_id}` });
  } catch (e) { bumpFail(`reminder_unread_deal_message:${String(e)}`); }

  try {
    const iso6h = new Date(now.getTime() - 6 * 3600_000).toISOString();
    const { data, error } = await db.from("notifications").select("id,user_id,contextual_conversation_id,created_at").eq("type", "contextual_message_received").is("read_at", null).not("contextual_conversation_id", "is", null).lte("created_at", iso6h).limit(300);
    if (error) throw new Error(error.message);
    for (const n of data ?? []) await reserveAndSend({ userId: n.user_id, type: "reminder_unread_contextual_message", title: "في رد لسه مستنيك", body: "في رسالة من محادثة بدأت بقصة ولسه ما اتقرتش.", prefCategory: "reminders", dedupeKey: `unread_contextual:${n.contextual_conversation_id}:${n.user_id}:${day}`, contextualConversationId: n.contextual_conversation_id, entityType: "contextual_conversation", entityId: n.contextual_conversation_id, route: `/contextual/${n.contextual_conversation_id}` });
  } catch (e) { bumpFail(`reminder_unread_contextual_message:${String(e)}`); }

  try {
    const iso7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
    const { data: items, error } = await db.from("items").select("id,owner_id").eq("status", "active").lte("created_at", iso7d).limit(300);
    if (error) throw new Error(error.message);
    for (const item of items ?? []) {
      const { count, error: offerErr } = await db.from("offers").select("id", { count: "exact", head: true }).eq("requested_item_id", item.id);
      if (offerErr) throw new Error(offerErr.message);
      if ((count ?? 0) > 0) continue;
      await reserveAndSend({ userId: item.owner_id, type: "nudge_listing_refresh_or_media", title: "حاجتك لسه لها قيمة", body: "جرّب تحدّث الصور أو تضيف فيديو بسيط عشان تزود ظهورها.", prefCategory: "reminders", dedupeKey: `listing_refresh:${item.id}:${day}`, itemId: item.id, entityType: "item", entityId: item.id, route: "/notifications" });
    }
  } catch (e) { bumpFail(`nudge_listing_refresh_or_media:${String(e)}`); }

  return json(200, { ok: true, sentByType, skipped, failures, deferred: ["digest_local_activity_pulse", "nudge_return_to_teswa"] });
});
