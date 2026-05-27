import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StreamWebhookPayload = {
  type?: string;
  message?: {
    id?: string;
    text?: string | null;
    type?: string;
    user?: { id?: string };
    attachments?: unknown[];
  };
  user?: { id?: string };
  channel_id?: string;
  cid?: string;
};

const DIRECT_CHANNEL_PREFIX = "teswa-direct-";
const UUIDISH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function isUuidish(value: string): boolean { return UUIDISH_REGEX.test(value.trim()); }
function isNewMessageEvent(payload: StreamWebhookPayload): boolean { return payload.type === "message.new" || payload.type === "message"; }

function getChannelId(payload: StreamWebhookPayload): string {
  const direct = typeof payload.channel_id === "string" ? payload.channel_id.trim() : "";
  if (direct) return direct;
  const cid = typeof payload.cid === "string" ? payload.cid.trim() : "";
  if (!cid) return "";
  const parts = cid.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : cid;
}

function buildBodyPreview(message: StreamWebhookPayload["message"]): string {
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (text.length > 0) return text.slice(0, 80);
  if (Array.isArray(message?.attachments) && message.attachments.length > 0) return "وصلك ملف في المحادثة.";
  return "وصلك رسالة مباشرة.";
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    const expectedSecret = Deno.env.get("TESWA_STREAM_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-teswa-stream-webhook-secret");
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) return jsonResponse(401, { ok: false, error: "unauthorized" });

    let payload: StreamWebhookPayload;
    try { payload = (await req.json()) as StreamWebhookPayload; } catch { return jsonResponse(400, { ok: false, error: "malformed_payload" }); }

    if (!isNewMessageEvent(payload)) return jsonResponse(200, { ok: true, skipped: true, reason: "unsupported_event" });
    if (payload.message?.type === "system") return jsonResponse(200, { ok: true, skipped: true, reason: "system_message" });

    const channelId = getChannelId(payload);
    if (!channelId || !channelId.startsWith(DIRECT_CHANNEL_PREFIX)) return jsonResponse(200, { ok: true, skipped: true, reason: "not_direct_channel" });

    const conversationId = channelId.slice(DIRECT_CHANNEL_PREFIX.length).trim();
    if (!isUuidish(conversationId)) return jsonResponse(200, { ok: true, skipped: true, reason: "invalid_conversation_id" });

    const messageId = payload.message?.id?.trim();
    const senderUserId = payload.message?.user?.id?.trim() || payload.user?.id?.trim();
    if (!messageId || !senderUserId) return jsonResponse(200, { ok: true, skipped: true, reason: "missing_message_or_sender" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { ok: false, error: "server_misconfigured" });
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: conversation, error: conversationError } = await supabase
      .from("direct_conversations")
      .select("id,status,participant_a,participant_b")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) return jsonResponse(200, { ok: true, skipped: true, reason: "conversation_not_found" });
    if (conversation.status !== "accepted") return jsonResponse(200, { ok: true, skipped: true, reason: "conversation_not_accepted" });

    const senderIsA = conversation.participant_a === senderUserId;
    const senderIsB = conversation.participant_b === senderUserId;
    if (!senderIsA && !senderIsB) return jsonResponse(200, { ok: true, skipped: true, reason: "sender_not_participant" });

    const receiverUserId = senderIsA ? conversation.participant_b : conversation.participant_a;
    if (!receiverUserId || receiverUserId === senderUserId) return jsonResponse(200, { ok: true, skipped: true, reason: "invalid_receiver" });

    const { data: blockRows, error: blockError } = await supabase
      .from("user_blocks")
      .select("id")
      .or(`and(blocker_id.eq.${senderUserId},blocked_user_id.eq.${receiverUserId}),and(blocker_id.eq.${receiverUserId},blocked_user_id.eq.${senderUserId})`)
      .limit(1);
    if (blockError) return jsonResponse(500, { ok: false, error: "block_query_failed" });
    if ((blockRows ?? []).length > 0) return jsonResponse(200, { ok: true, skipped: true, reason: "blocked_relationship" });

    const { data: eventInsert, error: eventInsertError } = await supabase
      .from("direct_push_events")
      .insert({ stream_message_id: messageId, conversation_id: conversationId, sender_id: senderUserId, receiver_id: receiverUserId })
      .select("id")
      .single();

    if (eventInsertError) {
      if (eventInsertError.code === "23505") return jsonResponse(200, { ok: true, skipped: true, reason: "duplicate_stream_message" });
      return jsonResponse(500, { ok: false, error: "event_insert_failed" });
    }

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({ user_id: receiverUserId, actor_user_id: senderUserId, type: "direct_message_received", title: "رسالة جديدة على تِسوى", body: buildBodyPreview(payload.message), route: `/direct/${conversationId}` })
      .select("id")
      .single();
    if (notificationError) return jsonResponse(500, { ok: false, error: "notification_insert_failed" });

    await supabase.from("direct_push_events").update({ notification_id: notification.id }).eq("id", eventInsert.id as string);

    console.log("direct_push_notification_created", { conversationId, messageId, senderUserId, receiverUserId, messageLength: payload.message?.text?.length ?? 0 });
    return jsonResponse(200, { ok: true, skipped: false, notificationId: notification.id });
  } catch (error) {
    console.error("stream_direct_message_webhook_error", { message: error instanceof Error ? error.message : "unknown_error" });
    return jsonResponse(500, { ok: false, error: "internal_error" });
  }
});
