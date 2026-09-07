#!/usr/bin/env python3
"""Teswa-owned push notification worker.

Rehearsal-safe by default: outbound Expo delivery is disabled unless
TESWA_PUSH_SEND_ENABLED=1. Database access uses local psql/peer auth; no database
password or Supabase credential is stored by this worker.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PSQL = os.environ.get("TESWA_PSQL", "/usr/pgsql-17/bin/psql")
DB = os.environ.get("TESWA_DB", "teswa_rehearsal")
SEND_ENABLED = os.environ.get("TESWA_PUSH_SEND_ENABLED", "0") == "1"
EXPO_URL = "https://exp.host/--/api/v2/push/send"
ALLOWED_TYPES = {
    "offer_received", "offer_thinking", "offer_accepted", "offer_soft_rejected", "offer_redirected",
    "deal_created", "deal_message_received", "deal_voice_message_received",
    "deal_completion_confirmation_needed", "deal_completed", "deal_cancelled",
    "story_reply_received", "contextual_message_received", "report_update", "system",
    "reminder_offer_response_needed", "reminder_deal_coordination_needed",
    "reminder_deal_confirmation_pending", "reminder_unread_deal_message",
    "reminder_unread_contextual_message", "nudge_listing_refresh_or_media",
    "digest_local_activity_pulse", "nudge_return_to_teswa", "user_followed_you",
    "direct_message_received",
}


def sql(query: str) -> str:
    p = subprocess.run(
        [PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", query],
        text=True, capture_output=True, check=False,
    )
    if p.returncode != 0:
        raise RuntimeError("database_query_failed:" + (p.stderr.strip().splitlines()[-1] if p.stderr.strip() else "unknown"))
    return p.stdout.strip()


def claim_one() -> dict | None:
    raw = sql("""
WITH picked AS (
  SELECT job_id FROM teswa_jobs.push_outbox
  WHERE status='pending' AND available_at <= now()
  ORDER BY job_id FOR UPDATE SKIP LOCKED LIMIT 1
), claimed AS (
  UPDATE teswa_jobs.push_outbox j
  SET status='processing', attempts=j.attempts+1, claimed_at=now(), last_error=NULL
  FROM picked p WHERE j.job_id=p.job_id
  RETURNING j.job_id,j.notification_id,j.user_id,j.notification_type,j.attempts
)
SELECT row_to_json(claimed)::text FROM claimed;
""")
    return json.loads(raw) if raw else None


def load_job(notification_id: str) -> dict | None:
    q = f"""
SELECT row_to_json(x)::text FROM (
  SELECT n.id,n.user_id,n.type::text,n.title,n.body,n.route,n.item_id,n.offer_id,n.deal_id,
         n.contextual_conversation_id,n.actor_user_id,
         p.display_name AS actor_display_name,p.username AS actor_username,p.avatar_url AS actor_avatar_url,
         np.offers_enabled,np.deals_enabled,np.messages_enabled,np.social_enabled,np.smart_reminders_enabled,
         COALESCE((SELECT json_agg(json_build_object('id',d.id,'token',d.expo_push_token) ORDER BY d.id)
                   FROM public.push_devices d
                   WHERE d.user_id=n.user_id AND d.notifications_enabled=true AND d.disabled_at IS NULL), '[]'::json) AS devices
  FROM public.notifications n
  LEFT JOIN public.profiles p ON p.id=n.actor_user_id
  LEFT JOIN public.notification_preferences np ON np.user_id=n.user_id
  WHERE n.id='{notification_id}'::uuid
) x;
"""
    raw = sql(q)
    return json.loads(raw) if raw else None


def category(t: str) -> str:
    if t in {"offer_received","offer_thinking","offer_accepted","offer_soft_rejected","offer_redirected"}: return "offers"
    if t in {"deal_created","deal_message_received","deal_voice_message_received","deal_completion_confirmation_needed","deal_completed","deal_cancelled"}: return "deals"
    if t in {"direct_message_received","contextual_message_received","story_reply_received"}: return "messages"
    if t in {"user_followed_you","digest_local_activity_pulse","nudge_listing_refresh_or_media","nudge_return_to_teswa"}: return "social"
    if t.startswith("reminder_"): return "smart_reminders"
    return "always"


def preference_enabled(row: dict) -> bool:
    c = category(row["type"])
    if c == "always": return True
    key = c + "_enabled"
    value = row.get(key)
    return True if value is None else bool(value)


def actor_name(row: dict) -> str:
    return (row.get("actor_display_name") or row.get("actor_username") or "مستخدم على تِسوى").strip()


def route_for(row: dict) -> str | None:
    route = (row.get("route") or "").strip()
    if route: return route
    if row.get("deal_id"): return f"/deal/{row['deal_id']}"
    if row.get("offer_id"): return f"/offer/{row['offer_id']}"
    if row.get("item_id"): return f"/item/{row['item_id']}"
    return None


def payload_for(row: dict, token: str) -> dict:
    t = row["type"]
    name = actor_name(row)
    title = (row.get("title") or "رسالة جديدة على تِسوى").strip()
    body = (row.get("body") or "عندك إشعار جديد على تِسوى").strip()
    if t == "direct_message_received": title, body = f"رسالة من {name}", (row.get("body") or "وصلك رسالة مباشرة.").strip()
    elif t == "deal_message_received": title, body = f"رسالة في الصفقة من {name}", (row.get("body") or "وصلك رد جديد في دردشة الصفقة.").strip()
    elif t == "deal_voice_message_received": title, body = f"رسالة صوتية من {name}", "وصلك تسجيل صوتي في دردشة الصفقة."
    elif t == "offer_received": title, body = f"عرض جديد من {name}", (row.get("body") or "وصلك عرض تبادل جديد.").strip()
    elif t == "offer_accepted": title, body = f"العرض اتقبل من {name}", (row.get("body") or "افتح التفاصيل وكملوا التنسيق.").strip()
    elif t == "user_followed_you": title, body = f"{name} تابعك", "افتح الملف وشوف النشاط الجديد."
    elif t == "report_update": title, body = "تحديث على البلاغ", (row.get("body") or "راجع نتيجة البلاغ.").strip()
    route = route_for(row)
    data = {"notificationId": row["id"], "notificationType": t}
    for src,dst in (("deal_id","dealId"),("offer_id","offerId"),("item_id","itemId"),("contextual_conversation_id","contextualConversationId"),("actor_user_id","actorUserId")):
        if row.get(src): data[dst] = row[src]
    if route:
        data["route"] = route
        if route.startswith("/direct/"): data["conversationId"] = route[len("/direct/"):]
    msg = {"to": token, "title": title, "body": body, "sound": "default", "channelId": "teswa-activity", "data": data}
    if t == "direct_message_received": msg["categoryId"] = "direct_message"
    if t in {"direct_message_received","deal_message_received"}: msg["priority"] = "high"
    avatar = (row.get("actor_avatar_url") or "").strip()
    if avatar.startswith("https://"):
        msg["image"] = avatar
        data["actorAvatarUrl"] = avatar
    return msg


def finish(job_id: int, status: str, error: str | None = None, retry_seconds: int | None = None) -> None:
    safe = (error or "").replace("'", "''")[:500]
    if retry_seconds is not None:
        sql(f"UPDATE teswa_jobs.push_outbox SET status='pending', available_at=now()+interval '{int(retry_seconds)} seconds', last_error='{safe}' WHERE job_id={int(job_id)}")
    else:
        sql(f"UPDATE teswa_jobs.push_outbox SET status='{status}', completed_at=now(), last_error=" + (f"'{safe}'" if safe else "NULL") + f" WHERE job_id={int(job_id)}")


def disable_device(device_id: str) -> None:
    sql(f"UPDATE public.push_devices SET disabled_at=COALESCE(disabled_at,now()), updated_at=now() WHERE id='{device_id}'::uuid")


def send(messages: list[dict]) -> dict:
    req = urllib.request.Request(EXPO_URL, data=json.dumps(messages, separators=(",", ":")).encode(), headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        if r.status < 200 or r.status >= 300: raise RuntimeError(f"expo_http_{r.status}")
        return json.loads(r.read().decode())


def process_one() -> dict:
    job = claim_one()
    if not job: return {"processed": False, "reason": "empty"}
    jid = int(job["job_id"])
    try:
        row = load_job(job["notification_id"])
        if not row:
            finish(jid, "skipped", "notification_missing")
            return {"processed": True, "status": "skipped", "reason": "notification_missing"}
        if row["type"] not in ALLOWED_TYPES:
            finish(jid, "skipped", "notification_type_not_allowlisted")
            return {"processed": True, "status": "skipped", "reason": "notification_type_not_allowlisted"}
        if not preference_enabled(row):
            finish(jid, "skipped", "notifications_disabled_by_preference")
            return {"processed": True, "status": "skipped", "reason": "preference"}
        devices = [d for d in (row.get("devices") or []) if isinstance(d.get("token"), str) and d["token"]]
        if not devices:
            finish(jid, "skipped", "no_active_devices")
            return {"processed": True, "status": "skipped", "reason": "no_active_devices"}
        messages = [payload_for(row, d["token"]) for d in devices]
        if not SEND_ENABLED:
            finish(jid, "skipped", "rehearsal_send_disabled")
            return {"processed": True, "status": "skipped", "reason": "rehearsal_send_disabled", "deviceCount": len(devices)}
        result = send(messages)
        tickets = result.get("data") or []
        accepted = 0
        errors = []
        for i,ticket in enumerate(tickets):
            if ticket.get("status") == "ok":
                accepted += 1
            else:
                err = ((ticket.get("details") or {}).get("error") or "unknown_error")
                errors.append(err)
                if err == "DeviceNotRegistered" and i < len(devices): disable_device(devices[i]["id"])
        if accepted > 0:
            finish(jid, "sent", ",".join(sorted(set(errors))) if errors else None)
            return {"processed": True, "status": "sent", "attempted": len(messages), "accepted": accepted}
        raise RuntimeError("expo_no_accepted_tickets:" + ",".join(errors[:5]))
    except Exception as exc:
        attempts = int(job.get("attempts") or 1)
        if attempts < 5:
            finish(jid, "pending", str(exc), min(300, 15 * (2 ** (attempts - 1))))
            return {"processed": True, "status": "retry", "attempts": attempts}
        finish(jid, "failed", str(exc))
        return {"processed": True, "status": "failed", "attempts": attempts}


def health() -> dict:
    db_ok = sql("SELECT CASE WHEN to_regclass('teswa_jobs.push_outbox') IS NULL THEN '0' ELSE '1' END") == "1"
    return {"status":"ok" if db_ok else "degraded", "service":"teswa-push-shadow-worker", "database":DB, "outboxReady":db_ok, "sendEnabled":SEND_ENABLED, "supabaseRuntimeDependency":False}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--health", action="store_true")
    ap.add_argument("--sleep", type=float, default=2.0)
    args = ap.parse_args()
    if args.health:
        print(json.dumps(health(), separators=(",",":"))); return 0
    if args.once:
        print(json.dumps(process_one(), separators=(",",":"))); return 0
    while True:
        try:
            result = process_one()
            if not result.get("processed"): time.sleep(max(0.5,args.sleep))
        except Exception as exc:
            print(json.dumps({"workerError":str(exc)[:300]}), file=sys.stderr, flush=True)
            time.sleep(max(1.0,args.sleep))

if __name__ == "__main__":
    raise SystemExit(main())
