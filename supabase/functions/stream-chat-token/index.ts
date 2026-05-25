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

    const streamClient = StreamChat.getInstance(streamApiKey, streamSecret);
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
