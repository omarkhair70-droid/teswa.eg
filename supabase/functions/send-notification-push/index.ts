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
  | "user_followed_you"
  | "direct_message_received";

const ALLOWED_TYPES: ReadonlySet<NotificationType> = new Set([
  "offer_received",
  "offer_thinking",
  "offer_accepted",
  "offer_soft_rejected",
  "offer_redirected",
  "deal_created",
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
  "direct_message_received",
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

type ActorProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: unknown;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const DEFAULT_TITLE = "رسالة جديدة على تِسوى";
const DEFAULT_BODY = "عندك إشعار جديد على تِسوى";
const DEFAULT_ACTOR_NAME = "مستخدم على تِسوى";
const ANDROID_CHANNEL_ID = "teswa-activity";

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

function deriveRoute(record: NotificationRecord): string | null {
  const route = typeof record.route === "string" ? record.route.trim() : "";
  if (route.length > 0) return route;
  if (record.deal_id) return `/deal/${record.deal_id}`;
  if (record.offer_id) return `/offer/${record.offer_id}`;
  if (record.item_id) return `/item/${record.item_id}`;
  return null;
}

function resolveActorName(profile: ActorProfile | null): string {
  const displayName = profile?.display_name?.trim() ?? "";
  if (displayName) return displayName;
  const username = profile?.username?.trim() ?? "";
  if (username) return username;
  return DEFAULT_ACTOR_NAME;
}

function extractDirectConversationId(route: string | null): string | null {
  if (!route || !route.startsWith("/direct/")) return null;
  const id = route.replace("/direct/", "").trim();
  return id.length > 0 ? id : null;
}

function resolveSafeAvatarUrl(profile: ActorProfile | null): string | null {
  const avatarUrl = profile?.avatar_url?.trim() ?? "";
  if (!avatarUrl) return null;
  try {
    const parsed = new URL(avatarUrl);
    if (parsed.protocol === "https:") return avatarUrl;
  } catch {
    return null;
  }
  return null;
}

function buildPremiumPushPayload(record: NotificationRecord, actorProfile: ActorProfile | null): {
  title: string;
  body: string;
  subtitle?: string;
  data: Record<string, unknown>;
} {
  const actorName = resolveActorName(actorProfile);
  const route = deriveRoute(record);
  const conversationId = extractDirectConversationId(route);
  const fallbackTitle = record.title?.trim() || DEFAULT_TITLE;
  const fallbackBody = record.body?.trim() || DEFAULT_BODY;

  let title = fallbackTitle;
  let body = fallbackBody;

  switch (record.type as NotificationType) {
    case "direct_message_received":
      title = `رسالة من ${actorName}`;
      body = record.body?.trim() || "وصلك رسالة مباشرة.";
      break;
    case "deal_message_received":
      title = `رسالة في الصفقة من ${actorName}`;
      body = record.body?.trim() || "وصلك رد جديد في دردشة الصفقة.";
      break;
    case "deal_voice_message_received":
      title = `رسالة صوتية من ${actorName}`;
      body = "وصلك تسجيل صوتي في دردشة الصفقة.";
      break;
    case "offer_received":
      title = `عرض جديد من ${actorName}`;
      body = record.body?.trim() || "وصلك عرض تبادل جديد.";
      break;
    case "offer_accepted":
      title = `العرض اتقبل من ${actorName}`;
      body = record.body?.trim() || "افتح التفاصيل وكملوا التنسيق.";
      break;
    case "user_followed_you":
      title = `${actorName} تابعك`;
      body = "افتح الملف وشوف النشاط الجديد.";
      break;
    case "report_update":
      title = "تحديث على البلاغ";
      body = record.body?.trim() || "راجع نتيجة البلاغ.";
      break;
    case "system":
    default:
      break;
  }

  return {
    title,
    body,
    data: {
      ...(route ? { route } : {}),
      notificationId: record.id,
      notificationType: record.type,
      ...(record.deal_id ? { dealId: record.deal_id } : {}),
      ...(record.offer_id ? { offerId: record.offer_id } : {}),
      ...(record.item_id ? { itemId: record.item_id } : {}),
      ...(record.contextual_conversation_id ? { contextualConversationId: record.contextual_conversation_id } : {}),
      ...(record.actor_user_id ? { actorUserId: record.actor_user_id } : {}),
      ...(conversationId ? { conversationId } : {}),
    },
  };
}

function shouldUseHighPriority(type: string) {
  return type === "direct_message_received" || type === "deal_message_received";
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

    const preferenceCategory = (() => {
      switch (record.type as NotificationType) {
        case "offer_received":
        case "offer_thinking":
        case "offer_accepted":
        case "offer_soft_rejected":
        case "offer_redirected":
          return "offers";
        case "deal_created":
        case "deal_message_received":
        case "deal_voice_message_received":
        case "deal_completion_confirmation_needed":
        case "deal_completed":
        case "deal_cancelled":
          return "deals";
        case "direct_message_received":
        case "contextual_message_received":
        case "story_reply_received":
          return "messages";
        case "user_followed_you":
        case "digest_local_activity_pulse":
        case "nudge_listing_refresh_or_media":
        case "nudge_return_to_teswa":
          return "social";
        case "reminder_offer_response_needed":
        case "reminder_deal_coordination_needed":
        case "reminder_deal_confirmation_pending":
        case "reminder_unread_deal_message":
        case "reminder_unread_contextual_message":
          return "smart_reminders";
        default:
          return "always";
      }
    })();

    const { data: preferenceRow, error: prefError } = await supabase
      .from("notification_preferences")
      .select("offers_enabled,deals_enabled,messages_enabled,social_enabled,smart_reminders_enabled")
      .eq("user_id", record.user_id)
      .maybeSingle();

    if (prefError) {
      console.warn("Push preference lookup failed; continuing", { ...baseLog, code: prefError.code, message: prefError.message });
    }

    const isEnabledByPreference = (() => {
      if (!preferenceRow) return true;
      if (preferenceCategory === "messages") return Boolean(preferenceRow.messages_enabled);
      if (preferenceCategory === "offers") return Boolean(preferenceRow.offers_enabled);
      if (preferenceCategory === "deals") return Boolean(preferenceRow.deals_enabled);
      if (preferenceCategory === "social") return Boolean(preferenceRow.social_enabled);
      if (preferenceCategory === "smart_reminders") return Boolean(preferenceRow.smart_reminders_enabled);
      return true;
    })();

    if (!isEnabledByPreference) {
      console.log("Push skipped", { ...baseLog, skipped: true, reason: "notifications_disabled_by_preference" });
      return jsonResponse(200, { ok: true, skipped: true, reason: "notifications_disabled_by_preference" });
    }

    let actorProfile: ActorProfile | null = null;
    if (record.actor_user_id) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .eq("id", record.actor_user_id)
        .maybeSingle();
      if (error) {
        console.warn("Actor profile lookup failed; fallback payload will be used", {
          ...baseLog,
          actorUserId: record.actor_user_id,
          code: error.code,
          message: error.message,
        });
      } else {
        actorProfile = data;
      }
    }

    const premiumPayload = buildPremiumPushPayload(record, actorProfile);
    const avatarUrl = resolveSafeAvatarUrl(actorProfile);

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

    const messages = activeDevices.map((device) => ({
      to: device.expo_push_token,
      title: premiumPayload.title,
      body: premiumPayload.body,
      ...(record.type === "direct_message_received" ? { categoryId: "direct_message" } : {}),
      sound: "default",
      channelId: ANDROID_CHANNEL_ID,
      ...(shouldUseHighPriority(record.type) ? { priority: "high" } : {}),
      ...(avatarUrl ? { image: avatarUrl } : {}),
      data: {
        ...premiumPayload.data,
        ...(avatarUrl ? { actorAvatarUrl: avatarUrl } : {}),
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
