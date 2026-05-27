import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Server-only dependency used inside Supabase Edge Functions to mint Stream user tokens.
import { StreamChat } from "npm:stream-chat";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "Only POST is allowed." });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { ok: false, error: "unauthorized", message: "Authentication required." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(500, { ok: false, error: "server_misconfigured", message: "Supabase auth configuration is missing." });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user?.id) {
      return jsonResponse(401, { ok: false, error: "unauthorized", message: "Invalid or expired session." });
    }

    const streamApiKey = Deno.env.get("STREAM_CHAT_API_KEY")?.trim() ?? "";
    const streamSecret = Deno.env.get("STREAM_CHAT_SECRET")?.trim() ?? "";

    if (!streamApiKey || !streamSecret) {
      return jsonResponse(500, {
        ok: false,
        error: "server_misconfigured",
        message: "Stream Chat backend credentials are missing.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body?.conversationId === "string" && body.conversationId.trim().length > 0 ? body.conversationId.trim() : null;
    const otherUserId = typeof body?.otherUserId === "string" && body.otherUserId.trim().length > 0 ? body.otherUserId.trim() : null;
    const displayName = typeof body?.displayName === "string" && body.displayName.trim().length > 0 ? body.displayName.trim() : null;
    const avatarUrl = typeof body?.avatarUrl === "string" && body.avatarUrl.trim().length > 0 ? body.avatarUrl.trim() : null;


    let validatedOtherUserId: string | null = null;

    if (conversationId) {
      if (!supabaseServiceRoleKey) {
        return jsonResponse(500, {
          ok: false,
          error: "server_misconfigured",
          message: "Supabase service role key is missing.",
        });
      }

      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false },
      });

      const { data: convo, error: convoError } = await adminClient
        .from("direct_conversations")
        .select("id, status, participant_a, participant_b")
        .eq("id", conversationId)
        .maybeSingle();

      if (convoError || !convo) {
        return jsonResponse(403, { ok: false, error: "conversation_unauthorized", message: "غير مسموح بفتح هذه المحادثة." });
      }

      const participantA = convo.participant_a;
      const participantB = convo.participant_b;
      const isParticipant = participantA === user.id || participantB === user.id;
      if (!isParticipant) {
        return jsonResponse(403, { ok: false, error: "conversation_unauthorized", message: "غير مسموح بفتح هذه المحادثة." });
      }

      if (convo.status !== "accepted") {
        return jsonResponse(403, { ok: false, error: "conversation_not_accepted", message: "المحادثة غير جاهزة للشات الجديد." });
      }

      validatedOtherUserId = participantA === user.id ? participantB : participantA;
      if (!validatedOtherUserId || validatedOtherUserId === user.id) {
        return jsonResponse(403, { ok: false, error: "invalid_other_user", message: "تعذر تحديد الطرف الآخر في المحادثة." });
      }

      if (otherUserId && otherUserId !== validatedOtherUserId) {
        return jsonResponse(403, { ok: false, error: "invalid_other_user", message: "تعذر تحديد الطرف الآخر في المحادثة." });
      }
    }

    const streamClient = StreamChat.getInstance(streamApiKey, streamSecret);

    try {
      const currentUserPayload: Record<string, string> = {
        id: user.id,
        name: displayName ?? user.email ?? user.id,
      };
      if (avatarUrl) currentUserPayload.image = avatarUrl;

      const usersToUpsert: Array<Record<string, string>> = [currentUserPayload];
      if (validatedOtherUserId && validatedOtherUserId !== user.id) usersToUpsert.push({ id: validatedOtherUserId });

      await streamClient.upsertUsers(usersToUpsert);
    } catch (upsertError) {
      const message = upsertError instanceof Error ? upsertError.message : "unknown_stream_upsert_error";
      console.error("stream-chat-token upsert failed", { message, userId: user.id, hasConversationId: !!conversationId, hasValidatedOtherUserId: !!validatedOtherUserId });
      return jsonResponse(500, {
        ok: false,
        error: "stream_user_upsert_failed",
        message: "تعذر تجهيز مستخدم الشات.",
      });
    }

    const token = streamClient.createToken(user.id);

    return jsonResponse(200, {
      ok: true,
      userId: user.id,
      token,
      apiKey: streamApiKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("stream-chat-token failed", { message });
    return jsonResponse(500, { ok: false, error: "internal_error", message: "Unable to mint Stream token." });
  }
});
