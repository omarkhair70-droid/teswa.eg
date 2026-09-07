#!/usr/bin/env python3
"""Teswa-owned smart re-engagement scheduler worker.

Ports the active semantics of the Supabase Edge Function
run-smart-reengagement-notifications. Rehearsal-safe by default: candidate
selection runs, but no notification/dispatch rows are inserted unless
TESWA_SMART_APPLY=1. The worker never sends push directly; inserts flow through
the Teswa push outbox/worker.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from zoneinfo import ZoneInfo

PSQL = os.environ.get("TESWA_PSQL", "/usr/pgsql-17/bin/psql")
DB = os.environ.get("TESWA_DB", "teswa_rehearsal")
APPLY_ENABLED = os.environ.get("TESWA_SMART_APPLY", "0") == "1"
DAILY_CAP = 4


def sql(query: str) -> str:
    p = subprocess.run(
        [PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", query],
        text=True, capture_output=True, check=False,
    )
    if p.returncode != 0:
        msg = p.stderr.strip().splitlines()[-1] if p.stderr.strip() else "unknown"
        raise RuntimeError("database_query_failed:" + msg)
    return p.stdout.strip()


def qlit(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def rows(query: str) -> list[dict]:
    raw = sql(f"SELECT COALESCE(json_agg(x),'[]'::json)::text FROM ({query}) x")
    return json.loads(raw or "[]")


def one(query: str) -> dict | None:
    data = rows(query)
    return data[0] if data else None


def parse_clock(value: object) -> int | None:
    if isinstance(value, int) and 0 <= value < 1440:
        return value
    if not isinstance(value, str):
        return None
    bits = value.strip().split(":")
    if len(bits) != 2:
        return None
    try:
        h, m = int(bits[0]), int(bits[1])
    except ValueError:
        return None
    return h * 60 + m if 0 <= h < 24 and 0 <= m < 60 else None


def quiet_now(pref: dict, now: dt.datetime) -> bool:
    if pref.get("quiet_hours_enabled") is not True:
        return False
    start, end = parse_clock(pref.get("quiet_hours_start")), parse_clock(pref.get("quiet_hours_end"))
    if start is None or end is None or start == end:
        return False
    try:
        local = now.astimezone(ZoneInfo(pref.get("timezone") or "UTC"))
    except Exception:
        local = now.astimezone(dt.timezone.utc)
    minute = local.hour * 60 + local.minute
    return start <= minute < end if start < end else minute >= start or minute < end


def prefs(user_id: str) -> dict:
    row = one(
        "SELECT smart_reminders_enabled,discovery_digest_enabled,return_nudges_enabled,"
        "quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone "
        f"FROM public.notification_preferences WHERE user_id={qlit(user_id)}::uuid"
    )
    return row or {
        "smart_reminders_enabled": True,
        "discovery_digest_enabled": True,
        "return_nudges_enabled": True,
        "quiet_hours_enabled": False,
        "quiet_hours_start": "23:00",
        "quiet_hours_end": "08:00",
        "timezone": "UTC",
    }


def category_enabled(pref: dict, category: str) -> bool:
    if category == "reminders":
        return pref.get("smart_reminders_enabled") is not False
    if category == "discovery_digest":
        return pref.get("discovery_digest_enabled") is not False
    if category == "return_nudges":
        return pref.get("return_nudges_enabled") is not False
    return True


def daily_sent(user_id: str, day_start: dt.datetime) -> int:
    out = sql(
        "SELECT count(*) FROM public.smart_notification_dispatches "
        f"WHERE user_id={qlit(user_id)}::uuid AND status='sent' AND sent_at>={qlit(day_start.isoformat())}::timestamptz"
    )
    return int(out or 0)


def reserve_and_insert(c: dict, now: dt.datetime, stats: dict) -> None:
    user_id = c["user_id"]
    pref = prefs(user_id)
    if not category_enabled(pref, c["category"]):
        stats["skipped"]["preferences"] += 1
        return
    if quiet_now(pref, now):
        stats["skipped"]["quietHours"] += 1
        return
    if daily_sent(user_id, now.replace(hour=0, minute=0, second=0, microsecond=0)) >= DAILY_CAP:
        stats["skipped"]["cap"] += 1
        return
    exists = sql(
        "SELECT count(*) FROM public.smart_notification_dispatches "
        f"WHERE dedupe_key={qlit(c['dedupe_key'])}"
    )
    if int(exists or 0) > 0:
        stats["skipped"]["dedupe"] += 1
        return

    stats["candidates"] += 1
    stats["byType"][c["type"]] = stats["byType"].get(c["type"], 0) + 1
    if not APPLY_ENABLED:
        return

    metadata = json.dumps({"route": c.get("route")}, separators=(",", ":"))
    dispatch_id = sql(
        "INSERT INTO public.smart_notification_dispatches("
        "user_id,notification_type,preference_category,entity_type,entity_id,dedupe_key,metadata,status) VALUES ("
        f"{qlit(user_id)}::uuid,{qlit(c['type'])},{qlit(c['category'])},{qlit(c.get('entity_type'))},"
        f"{qlit(c.get('entity_id'))}::uuid,{qlit(c['dedupe_key'])},{qlit(metadata)}::jsonb,'reserved') "
        "ON CONFLICT (dedupe_key) DO NOTHING RETURNING id"
    )
    if not dispatch_id:
        stats["skipped"]["dedupe"] += 1
        return
    try:
        notif_id = sql(
            "INSERT INTO public.notifications(user_id,type,title,body,deal_id,offer_id,item_id,contextual_conversation_id,route) VALUES ("
            f"{qlit(user_id)}::uuid,{qlit(c['type'])}::notification_type,{qlit(c['title'])},{qlit(c['body'])},"
            f"{qlit(c.get('deal_id'))}::uuid,{qlit(c.get('offer_id'))}::uuid,{qlit(c.get('item_id'))}::uuid,"
            f"{qlit(c.get('contextual_conversation_id'))}::uuid,{qlit(c.get('route'))}) RETURNING id"
        )
        sql(
            "UPDATE public.smart_notification_dispatches SET status='sent',"
            f"notification_id={qlit(notif_id)}::uuid,sent_at=now(),failure_reason=NULL WHERE id={qlit(dispatch_id)}::uuid"
        )
        stats["inserted"] += 1
    except Exception as exc:
        safe = str(exc)[:400].replace("'", "''")
        sql(
            "UPDATE public.smart_notification_dispatches SET status='failed',"
            f"failure_reason='{safe}' WHERE id={qlit(dispatch_id)}::uuid"
        )
        raise


def run_once() -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    day = now.date().isoformat()
    stats = {"candidates": 0, "inserted": 0, "byType": {}, "skipped": {"dedupe": 0, "cap": 0, "preferences": 0, "quietHours": 0}, "failures": {}}

    def attempt(label: str, fn) -> None:
        try:
            fn()
        except Exception as exc:
            stats["failures"][label] = str(exc)[:300]

    def offer_response() -> None:
        cutoff = (now - dt.timedelta(hours=12)).isoformat()
        for r in rows("SELECT id,receiver_id FROM public.offers WHERE status IN ('pending','thinking') AND created_at<=" + qlit(cutoff) + "::timestamptz ORDER BY created_at LIMIT 300"):
            reserve_and_insert({"user_id": r["receiver_id"], "type": "reminder_offer_response_needed", "title": "عندك عرض مستني قرارك", "body": "لو مناسب لك، احسم العرض عشان المقايضة ما توقف.", "category": "reminders", "dedupe_key": f"offer_response:{r['id']}:{day}", "offer_id": r["id"], "entity_type": "offer", "entity_id": r["id"], "route": f"/offer/{r['id']}"}, now, stats)

    def deal_coordination() -> None:
        cutoff = (now - dt.timedelta(hours=24)).isoformat()
        q = "SELECT d.id,d.requester_id,d.offerer_id,d.created_at,(SELECT max(m.created_at) FROM public.deal_messages m WHERE m.deal_id=d.id) last_message FROM public.swap_deals d WHERE d.status='coordinating' AND d.created_at<=" + qlit(cutoff) + "::timestamptz ORDER BY d.created_at LIMIT 300"
        for d in rows(q):
            if d.get("last_message") and d["last_message"] > cutoff:
                continue
            for uid in (d["requester_id"], d["offerer_id"]):
                reserve_and_insert({"user_id": uid, "type": "reminder_deal_coordination_needed", "title": "الصفقة لسه فاتحة بابها", "body": "كمّلوا التنسيق عشان توصلوا لإتمام المقايضة.", "category": "reminders", "dedupe_key": f"deal_coordination:{d['id']}:{uid}:{day}", "deal_id": d["id"], "entity_type": "deal", "entity_id": d["id"], "route": f"/deal/{d['id']}"}, now, stats)

    def deal_confirmation() -> None:
        q = "SELECT id,requester_id,offerer_id FROM public.swap_deals WHERE status='completed_pending_confirmation' LIMIT 300"
        for d in rows(q):
            confirmed = {x["user_id"] for x in rows(f"SELECT user_id FROM public.deal_confirmations WHERE deal_id={qlit(d['id'])}::uuid")}
            for uid in (d["requester_id"], d["offerer_id"]):
                if uid in confirmed:
                    continue
                reserve_and_insert({"user_id": uid, "type": "reminder_deal_confirmation_pending", "title": "الصفقة مستنية تأكيدك", "body": "الطرف التاني أكد الإتمام. أكّد أنت كمان لإغلاق الصفقة.", "category": "reminders", "dedupe_key": f"deal_confirmation:{d['id']}:{uid}:{day}", "deal_id": d["id"], "entity_type": "deal", "entity_id": d["id"], "route": f"/deal/{d['id']}"}, now, stats)

    def unread_deal() -> None:
        cutoff = (now - dt.timedelta(hours=6)).isoformat()
        q = "SELECT d.id,d.requester_id,d.offerer_id,m.id message_id,m.sender_id,m.created_at FROM public.swap_deals d JOIN LATERAL (SELECT id,sender_id,created_at FROM public.deal_messages WHERE deal_id=d.id ORDER BY created_at DESC LIMIT 1) m ON true WHERE d.status IN ('coordinating','completed_pending_confirmation') AND m.created_at<=" + qlit(cutoff) + "::timestamptz LIMIT 300"
        for d in rows(q):
            reads = {x["user_id"]: x["last_read_at"] for x in rows(f"SELECT user_id,last_read_at FROM public.deal_message_reads WHERE deal_id={qlit(d['id'])}::uuid")}
            for uid in (d["requester_id"], d["offerer_id"]):
                if uid == d["sender_id"]:
                    continue
                if reads.get(uid) and reads[uid] >= d["created_at"]:
                    continue
                reserve_and_insert({"user_id": uid, "type": "reminder_unread_deal_message", "title": "لسه في رسالة صفقة مستنياك", "body": "في رسالة ما اتقرتش في دردشة الصفقة. الرد السريع بيساعد التنسيق.", "category": "reminders", "dedupe_key": f"unread_deal:{d['id']}:{uid}:{day}", "deal_id": d["id"], "entity_type": "deal", "entity_id": d["id"], "route": f"/deal/{d['id']}"}, now, stats)

    def unread_contextual() -> None:
        cutoff = (now - dt.timedelta(hours=6)).isoformat()
        q = "SELECT c.id,c.starter_id,c.recipient_id,m.sender_id,m.created_at FROM public.contextual_conversations c JOIN LATERAL (SELECT sender_id,created_at FROM public.contextual_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) m ON true WHERE c.context_type='story_reply' AND m.created_at<=" + qlit(cutoff) + "::timestamptz LIMIT 300"
        for c in rows(q):
            reads = {x["user_id"]: x["last_read_at"] for x in rows(f"SELECT user_id,last_read_at FROM public.contextual_message_reads WHERE conversation_id={qlit(c['id'])}::uuid")}
            for uid in (c["starter_id"], c["recipient_id"]):
                if uid == c["sender_id"]:
                    continue
                if reads.get(uid) and reads[uid] >= c["created_at"]:
                    continue
                reserve_and_insert({"user_id": uid, "type": "reminder_unread_contextual_message", "title": "في رد لسه مستنيك", "body": "في رسالة من محادثة بدأت بقصة ولسه ما اتقرتش.", "category": "reminders", "dedupe_key": f"unread_contextual:{c['id']}:{uid}:{day}", "contextual_conversation_id": c["id"], "entity_type": "contextual_conversation", "entity_id": c["id"], "route": f"/contextual/{c['id']}"}, now, stats)

    def listing_refresh() -> None:
        cutoff = (now - dt.timedelta(days=7)).isoformat()
        q = "SELECT i.id,i.owner_id FROM public.items i WHERE i.status='active' AND i.created_at<=" + qlit(cutoff) + "::timestamptz AND NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.requested_item_id=i.id) ORDER BY i.created_at LIMIT 300"
        for i in rows(q):
            reserve_and_insert({"user_id": i["owner_id"], "type": "nudge_listing_refresh_or_media", "title": "حاجتك لسه لها قيمة", "body": "جرّب تحدّث الصور أو تضيف فيديو بسيط عشان تزود ظهورها.", "category": "reminders", "dedupe_key": f"listing_refresh:{i['id']}:{day}", "item_id": i["id"], "entity_type": "item", "entity_id": i["id"], "route": f"/item/{i['id']}"}, now, stats)

    attempt("reminder_offer_response_needed", offer_response)
    attempt("reminder_deal_coordination_needed", deal_coordination)
    attempt("reminder_deal_confirmation_pending", deal_confirmation)
    attempt("reminder_unread_deal_message", unread_deal)
    attempt("reminder_unread_contextual_message", unread_contextual)
    attempt("nudge_listing_refresh_or_media", listing_refresh)
    return {"ok": not bool(stats["failures"]), "applyEnabled": APPLY_ENABLED, "outboundPush": False, "deferred": ["digest_local_activity_pulse", "nudge_return_to_teswa"], **stats}


def health() -> dict:
    checks = {
        "notifications": "public.notifications",
        "dispatches": "public.smart_notification_dispatches",
        "pushOutbox": "teswa_jobs.push_outbox",
    }
    ready = {}
    for key, rel in checks.items():
        ready[key] = sql(f"SELECT CASE WHEN to_regclass('{rel}') IS NULL THEN '0' ELSE '1' END") == "1"
    return {"status": "ok" if all(ready.values()) else "degraded", "service": "teswa-smart-reengagement-shadow", "database": DB, "applyEnabled": APPLY_ENABLED, "outboundPush": False, "supabaseRuntimeDependency": False, **ready}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--health", action="store_true")
    args = ap.parse_args()
    if args.health:
        print(json.dumps(health(), separators=(",", ":"))); return 0
    print(json.dumps(run_once(), separators=(",", ":"), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
