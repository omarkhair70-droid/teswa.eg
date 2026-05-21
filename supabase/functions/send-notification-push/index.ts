import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationType =
  | "offer_received"
  | "offer_thinking"
  | "offer_accepted"
  | "offer_soft_rejected"
  | "offer_redirected"
  | "deal_created"
  | "deal_message_received"
  | "deal_voice_message_received"
  | "deal_completion_confirmation_needed"
  | "deal_completed"
  | "deal_cancelled"
  | "story_reply_received"
  | "contextual_message_received"
  | "report_update"
  | "system"
  | "reminder_offer_response_needed"
  | "reminder_deal_coordination_needed"
  | "reminder_deal_confirmation_pending"
  | "reminder_unread_deal_message"
  | "reminder_unread_contextual_message"
  | "nudge_listing_refresh_or_media"
  | "digest_local_activity_pulse"
  | "nudge_return_to_teswa"
  | "user_followed_you";

const ALLOWED_TYPES: ReadonlySet<NotificationType> = new Set([
  "offer_received",
  "offer_accepted",
  "offer_soft_rejected",
  "deal_message_received",
  "deal_voice_message_received",
  "deal_completion_confirmation_needed",
  "deal_completed",
  "deal_cancelled",
  "story_reply_received",
  "contextual_message_received",
  "report_update",
  "system",
  "reminder_offer_response_needed",
  "reminder_deal_coordination_needed",
  "reminder_deal_confirmation_pending",
  "reminder_unread_deal_message",
  "reminder_unread_contextual_message",
  "nudge_listing_refresh_or_media",
  "digest_local_activity_pulse",
  "nudge_return_to_teswa",
  "user_followed_you",
]);

type NotificationRecord = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  route?: string | null;
  item_id: string | null;
  offer_id: string | null;
  deal_id: string | null;
  contextual_conversation_id: string | null;
  actor_user_id: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: unknown;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isNotificationRecord(record: unknown): record is NotificationRecord {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Partial<NotificationRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.user_id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.title === "string"
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });

    const expectedSecret = Deno.env.get("TESWA_PUSH_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-teswa-push-webhook-secret");
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return jsonResponse(401, { ok: false, error: "unauthorized" });
    }

    let payload: WebhookPayload;
    try {
      payload = (await req.json()) as WebhookPayload;
    } catch {
      return jsonResponse(400, { ok: false, error: "malformed_payload" });
    }

    if (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "notifications") {
      return jsonResponse(200, { ok: true, skipped: true, reason: "unexpected_webhook_event" });
    }

    const record = payload.record;
    if (!isNotificationRecord(record)) return jsonResponse(400, { ok: false, error: "malformed_payload" });
    const baseLog = {
      notificationId: record.id,
      userId: record.user_id,
      notificationType: record.type,
    };
    if (!ALLOWED_TYPES.has(record.type as NotificationType)) {
      console.log("Push skipped", { ...baseLog, skipped: true, reason: "notification_type_not_allowlisted" });
      return jsonResponse(200, { ok: true, skipped: true, reason: "notification_type_not_allowlisted", notificationType: record.type });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { ok: false, error: "server_misconfigured" });

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: devices, error: devicesError } = await supabase
      .from("push_devices")
      .select("id,expo_push_token")
      .eq("user_id", record.user_id)
      .eq("notifications_enabled", true)
      .is("disabled_at", null);

    if (devicesError) {
      console.error("Failed querying push devices", { ...baseLog, code: devicesError.code, message: devicesError.message });
      return jsonResponse(500, { ok: false, error: "push_device_query_failed" });
    }

    const activeDevices = (devices ?? []).filter((device) => typeof device.expo_push_token === "string" && device.expo_push_token.length > 0);
    if (activeDevices.length === 0) {
      console.log("Push skipped", { ...baseLog, activeDevices: 0, attempted: 0, acceptedByExpo: 0, skipped: true, reason: "no_active_devices" });
      return jsonResponse(200, { ok: true, skipped: true, reason: "no_active_devices", attempted: 0, acceptedByExpo: 0 });
    }

    const route = typeof record.route === "string" ? record.route.trim() : "";

    const messages = activeDevices.map((device) => ({
      to: device.expo_push_token,
      title: record.title?.trim() || "رسالة جديدة على تِسوى",
      body: record.body?.trim() || "عندك إشعار جديد على تِسوى",
      data: {
        ...(route.length > 0 ? { route } : {}),
        notificationId: record.id,
        notificationType: record.type,
        ...(record.deal_id ? { dealId: record.deal_id } : {}),
        ...(record.offer_id ? { offerId: record.offer_id } : {}),
        ...(record.item_id ? { itemId: record.item_id } : {}),
        ...(record.contextual_conversation_id ? { contextualConversationId: record.contextual_conversation_id } : {}),
        ...(record.actor_user_id ? { actorUserId: record.actor_user_id } : {}),
      },
    }));

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messages) });
    if (!expoResponse.ok) {
      console.error("Expo push API request failed", { ...baseLog, activeDevices: activeDevices.length, attempted: messages.length, status: expoResponse.status, body: await expoResponse.text() });
      return jsonResponse(502, { ok: false, error: "expo_push_api_failed" });
    }

    const expoJson = (await expoResponse.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    const tickets = expoJson.data ?? [];
    const acceptedByExpo = tickets.filter((t) => t.status === "ok").length;
    const expoErrorSummaries = tickets
      .filter((ticket) => ticket.status === "error")
      .map((ticket) => ticket.details?.error ?? "unknown_error");

    const invalidTokenIndexes = tickets
      .map((ticket, index) => ({ ticket, index }))
      .filter(({ ticket }) => ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered")
      .map(({ index }) => index);

    if (invalidTokenIndexes.length > 0) {
      const invalidTokens = invalidTokenIndexes.map((idx) => activeDevices[idx]?.expo_push_token).filter((token): token is string => Boolean(token));
      const { error: disableError } = await supabase
        .from("push_devices")
        .update({ notifications_enabled: false, disabled_at: new Date().toISOString() })
        .in("expo_push_token", invalidTokens)
        .eq("user_id", record.user_id);

      if (disableError) {
        console.error("Failed disabling invalid push tokens", { ...baseLog, message: disableError.message, invalidTokenCount: invalidTokens.length });
      }
    }

    console.log("Push processed", {
      ...baseLog,
      activeDevices: activeDevices.length,
      attempted: messages.length,
      acceptedByExpo,
      skipped: false,
      expoErrorSummaries,
    });

    return jsonResponse(200, { ok: true, skipped: false, attempted: messages.length, acceptedByExpo });
  } catch (error) {
    console.error("Unhandled push delivery error", { message: error instanceof Error ? error.message : "unknown_error" });
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
