import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function removeStoragePrefix(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw new Error(`storage_list_failed:${bucket}`);
    const objects = data ?? [];
    if (!objects.length) break;

    const paths = objects
      .map((entry) => `${prefix}${entry.name}`)
      .filter((path) => path.trim().length > 0);

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
      if (removeError) throw new Error(`storage_remove_failed:${bucket}`);
    }

    if (objects.length < limit) break;
    offset += limit;
  }
}

async function removeStoragePaths(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
): Promise<void> {
  const unique = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
  if (!unique.length) return;
  const { error } = await supabase.storage.from(bucket).remove(unique);
  if (error) throw new Error(`storage_remove_failed:${bucket}`);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { ok: false, error: "unauthorized", message: "يلزم تسجيل الدخول لحذف الحساب." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { ok: false, error: "server_misconfigured" });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user?.id) {
      return jsonResponse(401, { ok: false, error: "unauthorized", message: "انتهت الجلسة الحالية. سجّل دخولك مرة أخرى." });
    }

    const userId = user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: storyRows, error: storyRowsError } = await admin
      .from("stories")
      .select("media_storage_path,media_thumbnail_storage_path")
      .eq("user_id", userId);
    if (storyRowsError) return jsonResponse(500, { ok: false, error: "story_lookup_failed", message: "تعذر تجهيز حذف بيانات القصص." });

    const storyPaths = (storyRows ?? []).flatMap((row) => [row.media_storage_path, row.media_thumbnail_storage_path]).filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("avatar_url,cover_url")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return jsonResponse(500, { ok: false, error: "profile_lookup_failed", message: "تعذر تجهيز حذف بيانات الملف الشخصي." });

    const profilePaths = [profileRow?.avatar_url, profileRow?.cover_url]
      .map((url) => {
        const value = typeof url === "string" ? url : "";
        const marker = "/storage/v1/object/public/profile-images/";
        const i = value.indexOf(marker);
        if (i < 0) return null;
        const raw = value.slice(i + marker.length).split("?")[0];
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: itemVideoRows, error: itemVideoError } = await admin
      .from("item_videos")
      .select("video_storage_path,item_id");
    if (itemVideoError) return jsonResponse(500, { ok: false, error: "item_video_lookup_failed", message: "تعذر تجهيز حذف فيديوهات العناصر." });

    const { data: myItems, error: myItemsError } = await admin.from("items").select("id").eq("owner_id", userId);
    if (myItemsError) return jsonResponse(500, { ok: false, error: "items_lookup_failed", message: "تعذر تجهيز حذف بيانات العناصر." });
    const myItemIds = new Set((myItems ?? []).map((row) => row.id as string));
    const itemVideoPaths = (itemVideoRows ?? [])
      .filter((row) => myItemIds.has(row.item_id as string))
      .map((row) => row.video_storage_path)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: contextualVoiceRows, error: contextualVoiceError } = await admin
      .from("contextual_messages")
      .select("media_storage_path")
      .eq("sender_id", userId)
      .eq("message_kind", "voice");
    if (contextualVoiceError) return jsonResponse(500, { ok: false, error: "contextual_voice_lookup_failed", message: "تعذر تجهيز حذف وسائط الرسائل الصوتية." });

    const contextualVoicePaths = (contextualVoiceRows ?? [])
      .map((row) => row.media_storage_path)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    await removeStoragePrefix(admin, "item-images", `items/${userId}/`);
    await removeStoragePrefix(admin, "item-videos", `${userId}/`);
    await removeStoragePrefix(admin, "story-media", `${userId}/`);
    await removeStoragePaths(admin, "profile-images", profilePaths);
    await removeStoragePaths(admin, "story-media", storyPaths);
    await removeStoragePaths(admin, "item-videos", itemVideoPaths);
    await removeStoragePaths(admin, "contextual-voice-messages", contextualVoicePaths);

    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.from("push_devices").delete().eq("user_id", userId);
    await admin.from("contextual_messages").delete().eq("sender_id", userId);
    await admin.from("contextual_message_reads").delete().eq("user_id", userId);
    await admin.from("contextual_conversations").delete().or(`starter_id.eq.${userId},recipient_id.eq.${userId}`);
    await admin.from("deal_messages").delete().eq("sender_id", userId);
    await admin.from("swap_deals").delete().or(`requester_id.eq.${userId},offerer_id.eq.${userId}`);
    await admin.from("offers").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await admin.from("reviews").delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`);
    await admin.from("reports").delete().or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`);

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      return jsonResponse(500, { ok: false, error: "auth_delete_failed", message: "تم تنظيف جزء من البيانات لكن تعذر حذف الحساب من المصادقة." });
    }

    return jsonResponse(200, { ok: true, message: "تم حذف الحساب وبياناته المرتبطة بنجاح." });
  } catch (error) {
    console.error("Unhandled account deletion error", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse(500, { ok: false, error: "internal_error", message: "تعذر حذف الحساب حالياً. حاول مرة أخرى." });
  }
});
