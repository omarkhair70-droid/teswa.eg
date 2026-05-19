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
    if (error) throw new Error(`storage_list_failed:${bucket}:${prefix}`);

    const objects = data ?? [];
    if (!objects.length) break;

    const paths = objects
      .map((entry) => `${prefix}${entry.name}`)
      .filter((path) => path.trim().length > 0);

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
      if (removeError) throw new Error(`storage_remove_failed:${bucket}:${prefix}`);
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

async function deleteWithErrorCheck(
  admin: ReturnType<typeof createClient>,
  table: string,
  apply: (query: ReturnType<typeof admin.from>) => ReturnType<typeof admin.from>,
  errorCode: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { error } = await apply(admin.from(table)).delete();
  if (error) {
    console.error("Account deletion DB cleanup failed", { table, code: error.code, message: error.message });
    return {
      ok: false,
      response: jsonResponse(500, { ok: false, error: errorCode, message: "تعذر إكمال حذف البيانات المرتبطة بالحساب." }),
    };
  }

  return { ok: true };
}

function deriveProfilePath(url: string | null | undefined): string | null {
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
      return jsonResponse(401, {
        ok: false,
        error: "unauthorized",
        message: "انتهت الجلسة الحالية. سجّل دخولك مرة أخرى.",
      });
    }

    const userId = user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Collect everything needed for storage cleanup before deleting rows.
    const [{ data: storyRows, error: storyRowsError }, { data: profileRow, error: profileError }] = await Promise.all([
      admin.from("stories").select("media_storage_path,media_thumbnail_storage_path").eq("user_id", userId),
      admin.from("profiles").select("avatar_url,cover_url").eq("id", userId).maybeSingle(),
    ]);

    if (storyRowsError) return jsonResponse(500, { ok: false, error: "story_lookup_failed", message: "تعذر تجهيز حذف بيانات القصص." });
    if (profileError) return jsonResponse(500, { ok: false, error: "profile_lookup_failed", message: "تعذر تجهيز حذف بيانات الملف الشخصي." });

    const storyPaths = (storyRows ?? [])
      .flatMap((row) => [row.media_storage_path, row.media_thumbnail_storage_path])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const profilePaths = [deriveProfilePath(profileRow?.avatar_url), deriveProfilePath(profileRow?.cover_url)]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: myDeals, error: dealsLookupError } = await admin
      .from("swap_deals")
      .select("id")
      .or(`requester_id.eq.${userId},offerer_id.eq.${userId}`);
    if (dealsLookupError) return jsonResponse(500, { ok: false, error: "deals_lookup_failed", message: "تعذر تجهيز حذف بيانات الصفقات." });

    const myDealIds = (myDeals ?? []).map((row) => row.id as string);

    const [{ data: itemVideoRows, error: itemVideoError }, { data: myItems, error: myItemsError }] = await Promise.all([
      admin.from("item_videos").select("video_storage_path,item_id"),
      admin.from("items").select("id").eq("owner_id", userId),
    ]);
    if (itemVideoError) return jsonResponse(500, { ok: false, error: "item_video_lookup_failed", message: "تعذر تجهيز حذف فيديوهات العناصر." });
    if (myItemsError) return jsonResponse(500, { ok: false, error: "items_lookup_failed", message: "تعذر تجهيز حذف بيانات العناصر." });

    const myItemIds = new Set((myItems ?? []).map((row) => row.id as string));
    const itemVideoPaths = (itemVideoRows ?? [])
      .filter((row) => myItemIds.has(row.item_id as string))
      .map((row) => row.video_storage_path)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: contextualConversationRows, error: contextualConversationError } = await admin
      .from("contextual_conversations")
      .select("id")
      .or(`starter_id.eq.${userId},recipient_id.eq.${userId}`);
    if (contextualConversationError) return jsonResponse(500, { ok: false, error: "contextual_conversations_lookup_failed", message: "تعذر تجهيز حذف محادثات الردود." });

    const contextualConversationIds = (contextualConversationRows ?? []).map((row) => row.id as string);

    const { data: contextualVoiceRows, error: contextualVoiceError } = contextualConversationIds.length
      ? await admin
        .from("contextual_messages")
        .select("media_storage_path")
        .in("conversation_id", contextualConversationIds)
        .eq("message_kind", "voice")
      : { data: [], error: null };
    if (contextualVoiceError) return jsonResponse(500, { ok: false, error: "contextual_voice_lookup_failed", message: "تعذر تجهيز حذف وسائط الرسائل الصوتية." });

    const contextualVoicePaths = (contextualVoiceRows ?? [])
      .map((row) => row.media_storage_path)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    const { data: dealVoiceRows, error: dealVoiceError } = myDealIds.length
      ? await admin
        .from("deal_messages")
        .select("audio_storage_path")
        .in("deal_id", myDealIds)
        .eq("message_type", "voice")
      : { data: [], error: null };
    if (dealVoiceError) return jsonResponse(500, { ok: false, error: "deal_voice_lookup_failed", message: "تعذر تجهيز حذف وسائط رسائل الصفقات." });

    const dealVoicePaths = (dealVoiceRows ?? [])
      .map((row) => row.audio_storage_path)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    // Storage cleanup first.
    await removeStoragePrefix(admin, "profile-images", `profiles/${userId}/avatar/`);
    await removeStoragePrefix(admin, "profile-images", `profiles/${userId}/cover/`);
    await removeStoragePrefix(admin, "item-images", `items/${userId}/`);
    await removeStoragePrefix(admin, "item-videos", `${userId}/`);
    await removeStoragePrefix(admin, "story-media", `${userId}/`);

    await removeStoragePaths(admin, "profile-images", profilePaths);
    await removeStoragePaths(admin, "story-media", storyPaths);
    await removeStoragePaths(admin, "item-videos", itemVideoPaths);
    await removeStoragePaths(admin, "contextual-voice-messages", contextualVoicePaths);
    await removeStoragePaths(admin, "deal-voice-messages", dealVoicePaths);

    const cleanupSteps: Array<Promise<{ ok: true } | { ok: false; response: Response }>> = [
      deleteWithErrorCheck(admin, "notifications", (q) => q.eq("user_id", userId), "notifications_delete_failed"),
      deleteWithErrorCheck(admin, "push_devices", (q) => q.eq("user_id", userId), "push_devices_delete_failed"),
      deleteWithErrorCheck(admin, "contextual_message_reads", (q) => q.eq("user_id", userId), "contextual_reads_delete_failed"),
      deleteWithErrorCheck(admin, "contextual_conversations", (q) => q.or(`starter_id.eq.${userId},recipient_id.eq.${userId}`), "contextual_conversations_delete_failed"),
      deleteWithErrorCheck(admin, "deal_messages", (q) => q.in("deal_id", myDealIds.length ? myDealIds : ["00000000-0000-0000-0000-000000000000"]), "deal_messages_delete_failed"),
      deleteWithErrorCheck(admin, "swap_deals", (q) => q.or(`requester_id.eq.${userId},offerer_id.eq.${userId}`), "swap_deals_delete_failed"),
      deleteWithErrorCheck(admin, "offers", (q) => q.or(`sender_id.eq.${userId},receiver_id.eq.${userId}`), "offers_delete_failed"),
      deleteWithErrorCheck(admin, "reviews", (q) => q.or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`), "reviews_delete_failed"),
      deleteWithErrorCheck(admin, "reports", (q) => q.or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`), "reports_delete_failed"),
    ];

    for (const step of cleanupSteps) {
      const result = await step;
      if (!result.ok) return result.response;
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("Auth user deletion failed", { code: deleteAuthError.code, message: deleteAuthError.message });
      return jsonResponse(500, { ok: false, error: "auth_delete_failed", message: "تم تنظيف جزء من البيانات لكن تعذر حذف الحساب من المصادقة." });
    }

    return jsonResponse(200, { ok: true, message: "تم حذف الحساب وبياناته المرتبطة بنجاح." });
  } catch (error) {
    console.error("Unhandled account deletion error", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      message: "تعذر حذف الحساب حالياً. حاول مرة أخرى.",
    });
  }
});
