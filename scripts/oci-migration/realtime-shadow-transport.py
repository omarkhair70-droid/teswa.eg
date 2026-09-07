#!/usr/bin/env python3
"""Teswa Lane 4 loopback-only realtime transport rehearsal.

This service does not carry production traffic. It validates the caller's existing
Teswa auth-shadow session by delegating to the local auth-shadow service, then
reads authorized durable events from teswa_realtime.read_events(). The durable
outbox remains the source for reconnect/catch-up; this process is only transport.
"""

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PSQL = "/usr/pgsql-17/bin/psql"
AUTH_SESSION_URL = "http://127.0.0.1:3110/v1/auth/session"
MAX_WAIT_MS = 25000
MAX_LIMIT = 200


def compact_json(value) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def verify_shadow_session(auth_header: str) -> str:
    if not auth_header.startswith("Bearer "):
        raise ValueError("missing_session")
    token = auth_header[7:].strip()
    if not token or len(token) > 8192:
        raise ValueError("invalid_session")
    req = urllib.request.Request(
        AUTH_SESSION_URL,
        headers={"Authorization": f"Bearer {token}", "User-Agent": "teswa-realtime-shadow/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise ValueError("invalid_session") from exc
    if body.get("authenticated") is not True or body.get("shadow") is not True:
        raise ValueError("invalid_session")
    user_id = body.get("user_id")
    if not isinstance(user_id, str) or len(user_id) != 36:
        raise ValueError("invalid_session_user")
    return user_id


def read_events(user_id: str, after_id: int, limit: int):
    sql = r"""
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE teswa_app_authenticated;
SELECT set_config('teswa.user_id', :'uid', true);
SELECT COALESCE(json_agg(row_to_json(x)),'[]'::json)
FROM teswa_realtime.read_events(:after_id::bigint,:limit::integer) x;
ROLLBACK;
"""
    proc = subprocess.run(
        [PSQL, "-X", "-qAt", "-d", "teswa_rehearsal", "-v", f"uid={user_id}", "-v", f"after_id={after_id}", "-v", f"limit={limit}"],
        input=sql.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=5,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError("database_read_failed")
    lines = [line for line in proc.stdout.decode("utf-8").splitlines() if line.strip()]
    if not lines:
        return []
    try:
        value = json.loads(lines[-1])
    except Exception as exc:
        raise RuntimeError("database_json_failed") from exc
    if not isinstance(value, list):
        raise RuntimeError("database_json_shape_failed")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "TeswaRealtimeShadow/1"

    def log_message(self, fmt, *args):
        # Never log Authorization headers or response bodies.
        print(f"request method={self.command} path={self.path.split('?')[0]} status_hint={fmt % args}", flush=True)

    def _json(self, status: int, body: dict):
        raw = compact_json(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            self._json(200, {
                "status": "ok",
                "service": "teswa-realtime-shadow",
                "mode": "durable-outbox-long-poll",
                "productionTraffic": False,
                "supabaseRuntimeDependency": False,
                "authAuthority": "teswa-auth-shadow-local",
                "maxWaitMs": MAX_WAIT_MS,
            })
            return
        if parsed.path != "/v1/realtime/events":
            self._json(404, {"error": "not_found"})
            return
        try:
            user_id = verify_shadow_session(self.headers.get("Authorization", ""))
            qs = parse_qs(parsed.query, keep_blank_values=False)
            after_id = int((qs.get("after") or ["0"])[0])
            limit = int((qs.get("limit") or ["100"])[0])
            wait_ms = int((qs.get("wait_ms") or ["0"])[0])
            if after_id < 0 or limit < 1 or limit > MAX_LIMIT or wait_ms < 0 or wait_ms > MAX_WAIT_MS:
                raise ValueError("invalid_query")
        except ValueError as exc:
            code = str(exc)
            status = 401 if code in {"missing_session", "invalid_session", "invalid_session_user"} else 400
            self._json(status, {"error": code})
            return

        deadline = time.monotonic() + (wait_ms / 1000.0)
        try:
            while True:
                events = read_events(user_id, after_id, limit)
                if events or time.monotonic() >= deadline:
                    next_after = after_id if not events else int(events[-1]["event_id"])
                    self._json(200, {
                        "events": events,
                        "after": after_id,
                        "nextAfter": next_after,
                        "hasEvents": bool(events),
                    })
                    return
                time.sleep(0.35)
        except Exception:
            self._json(503, {"error": "realtime_unavailable"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=3120)
    args = ap.parse_args()
    if args.bind != "127.0.0.1":
        raise SystemExit("shadow_transport_must_bind_loopback")
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print(f"teswa_realtime_shadow_listen={args.bind}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
