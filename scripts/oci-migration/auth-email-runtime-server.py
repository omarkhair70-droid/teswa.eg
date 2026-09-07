#!/usr/bin/env python3
"""Teswa OCI auth shadow runtime with durable sessions and email/password flows.

Rehearsal-only, loopback-only, no production traffic switch. Google positive E2E
remains intentionally deferred to app-adapter validation.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
CERT_CACHE_TTL_SECONDS = 3600
ACCESS_TTL_SECONDS = 900
REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_BODY_BYTES = 128 * 1024
PSQL = "/usr/pgsql-17/bin/psql"
DB = "teswa_rehearsal"


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * ((4 - len(value) % 4) % 4))


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def compact_json(value) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def refresh_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def pg_text(value: str) -> str:
    encoded = base64.b64encode(value.encode("utf-8")).decode("ascii")
    return f"convert_from(decode('{encoded}','base64'),'UTF8')"


class GoogleVerifier:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self._lock = threading.Lock()
        self._certs: dict[str, str] = {}
        self._expires_at = 0.0

    def _refresh_certs(self):
        req = urllib.request.Request(GOOGLE_CERTS_URL, headers={"User-Agent": "teswa-auth-shadow/3"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                raise ValueError("google_certs_unavailable")
            data = json.loads(resp.read().decode("utf-8"))
        if not isinstance(data, dict) or not data:
            raise ValueError("google_certs_invalid")
        self._certs = data
        self._expires_at = time.time() + CERT_CACHE_TTL_SECONDS

    def _get_cert(self, kid: str) -> str:
        with self._lock:
            if time.time() >= self._expires_at or kid not in self._certs:
                self._refresh_certs()
            cert = self._certs.get(kid)
        if not isinstance(cert, str) or "BEGIN CERTIFICATE" not in cert:
            raise ValueError("google_kid_unknown")
        return cert

    @staticmethod
    def _verify_signature(signing_input: bytes, signature: bytes, cert_pem: str):
        pub = subprocess.run(["openssl", "x509", "-pubkey", "-noout"], input=cert_pem.encode(), capture_output=True, check=False)
        if pub.returncode != 0 or b"BEGIN PUBLIC KEY" not in pub.stdout:
            raise ValueError("google_cert_parse_failed")
        with tempfile.NamedTemporaryFile(mode="wb") as pubf, tempfile.NamedTemporaryFile(mode="wb") as sigf:
            pubf.write(pub.stdout); pubf.flush(); sigf.write(signature); sigf.flush()
            check = subprocess.run(["openssl", "dgst", "-sha256", "-verify", pubf.name, "-signature", sigf.name], input=signing_input, capture_output=True, check=False)
        if check.returncode != 0:
            raise ValueError("google_signature_invalid")

    def verify(self, token: str) -> dict:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("google_token_malformed")
        try:
            header = json.loads(b64url_decode(parts[0])); claims = json.loads(b64url_decode(parts[1])); signature = b64url_decode(parts[2])
        except Exception as exc:
            raise ValueError("google_token_decode_failed") from exc
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError("google_token_header_invalid")
        self._verify_signature(f"{parts[0]}.{parts[1]}".encode("ascii"), signature, self._get_cert(header["kid"]))
        now = int(time.time()); aud = claims.get("aud")
        if not (self.client_id in aud if isinstance(aud, list) else aud == self.client_id):
            raise ValueError("google_audience_invalid")
        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise ValueError("google_issuer_invalid")
        exp = int(claims.get("exp", 0)); iat = int(claims.get("iat", 0))
        if exp <= now - 30 or iat > now + 300:
            raise ValueError("google_time_invalid")
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise ValueError("google_subject_missing")
        return claims


class IdentityMap:
    def __init__(self, path: str):
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        users = raw.get("users") or []; identities = raw.get("identities") or []
        if len(users) != 32 or len(identities) != 32 or raw.get("credential_material_included") is not False:
            raise SystemExit("identity_map_guard_failed")
        self.users = set(users)
        self.by_provider_hash: dict[tuple[str, str], str] = {}
        for row in identities:
            key = (row["provider"], row["subject_sha256"])
            if key in self.by_provider_hash:
                raise SystemExit("duplicate_identity_mapping")
            self.by_provider_hash[key] = row["user_id"]
        if not set(self.by_provider_hash.values()).issubset(self.users):
            raise SystemExit("identity_map_orphan")

    def map_subject(self, provider: str, subject: str):
        digest = hashlib.sha256(f"{provider}:{subject}".encode()).hexdigest()
        return self.by_provider_hash.get((provider, digest))


class PgStore:
    def _run(self, sql: str) -> str:
        proc = subprocess.run([PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-F", "|", "-d", DB], input=sql.encode("utf-8"), capture_output=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError("auth_store_query_failed")
        return proc.stdout.decode("utf-8").strip()

    def create_session(self, sid: str, user_id: str, provider: str, token_hash: str, expires_epoch: int):
        out = self._run(f"SELECT teswa_auth.create_session('{sid}'::uuid,'{user_id}'::uuid,{pg_text(provider)},{pg_text(token_hash)},to_timestamp({expires_epoch}));")
        if out != "t":
            raise RuntimeError("session_create_failed")

    def rotate_refresh(self, old_hash: str, new_hash: str, expires_epoch: int):
        out = self._run(f"SELECT session_id,user_id,provider FROM teswa_auth.rotate_refresh({pg_text(old_hash)},{pg_text(new_hash)},to_timestamp({expires_epoch}));")
        if not out:
            return None
        parts = out.split("|")
        if len(parts) != 3:
            raise RuntimeError("session_rotate_shape")
        return tuple(parts)

    def validate_session(self, sid: str, user_id: str) -> bool:
        return self._run(f"SELECT teswa_auth.validate_session('{sid}'::uuid,'{user_id}'::uuid);") == "t"

    def revoke_session(self, sid: str, user_id: str, reason: str = "logout") -> bool:
        return self._run(f"SELECT teswa_auth.revoke_session('{sid}'::uuid,'{user_id}'::uuid,{pg_text(reason)});") == "t"

    def active_count(self) -> int:
        return int(self._run("SELECT teswa_auth.active_session_count();") or "0")

    def verify_email_password(self, email: str, password: str):
        out = self._run(f"SELECT user_id,email_confirmed FROM teswa_auth.verify_email_password({pg_text(email)},{pg_text(password)});")
        if not out:
            return None
        uid, confirmed = out.split("|", 1)
        return uid, confirmed == "t"

    def email_state(self, email: str):
        out = self._run(f"SELECT user_id,email_confirmed FROM teswa_auth.get_email_account_state({pg_text(email)});")
        if not out:
            return None
        uid, confirmed = out.split("|", 1)
        return uid, confirmed == "t"

    def auth_user(self, user_id: str) -> dict:
        out = self._run(f"SELECT id,coalesce(email,''),coalesce(phone,''),coalesce(display_name,''),coalesce(avatar_url,'') FROM teswa_auth.get_auth_user('{user_id}'::uuid);")
        if not out:
            return {"id": user_id, "email": None, "phone": None, "displayName": None, "avatarUrl": None}
        uid, email, phone, display_name, avatar_url = out.split("|", 4)
        return {"id": uid, "email": email or None, "phone": phone or None, "displayName": display_name or None, "avatarUrl": avatar_url or None}

    def bootstrap_signup(self, email: str, password: str, display_name=None):
        user_id = str(uuid.uuid4())
        raw_token = secrets.token_urlsafe(40)
        token_sha = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        exp = int(time.time()) + 20 * 60
        display = display_name or ""
        out = self._run(
            f"SELECT teswa_auth.bootstrap_email_signup('{user_id}'::uuid,{pg_text(email)},{pg_text(password)},{pg_text(display)},{pg_text(token_sha)},to_timestamp({exp}));"
        )
        if out != "t":
            raise RuntimeError("signup_bootstrap_failed")
        return user_id

    def resend_confirmation(self, email: str) -> bool:
        raw_token = secrets.token_urlsafe(40)
        token_sha = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        exp = int(time.time()) + 20 * 60
        out = self._run(f"SELECT coalesce(teswa_auth.rotate_email_confirmation({pg_text(email)},{pg_text(token_sha)},to_timestamp({exp}))::text,'');")
        return bool(out)


class SessionSigner:
    def __init__(self, secret_path: str, store: PgStore):
        secret = Path(secret_path).read_bytes().strip()
        if len(secret) < 32:
            raise SystemExit("session_secret_too_short")
        self.secret = secret
        self.store = store

    def issue_access(self, user_id: str, provider: str, sid: str):
        now = int(time.time()); exp = now + ACCESS_TTL_SECONDS
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {"ver": 3, "iss": "teswa-auth-shadow", "aud": "teswa-shadow", "sub": user_id, "provider": provider, "sid": sid, "iat": now, "exp": exp, "jti": secrets.token_urlsafe(16), "shadow": True}
        a = b64url_encode(compact_json(header)); b = b64url_encode(compact_json(payload))
        sig = hmac.new(self.secret, f"{a}.{b}".encode("ascii"), hashlib.sha256).digest()
        return f"{a}.{b}.{b64url_encode(sig)}", exp

    def verify_access(self, token: str) -> dict:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("session_malformed")
        expected = hmac.new(self.secret, f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
        supplied = b64url_decode(parts[2]); payload = json.loads(b64url_decode(parts[1]))
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("session_signature_invalid")
        now = int(time.time())
        if payload.get("iss") != "teswa-auth-shadow" or payload.get("aud") != "teswa-shadow" or payload.get("shadow") is not True or int(payload.get("exp", 0)) <= now:
            raise ValueError("session_claims_invalid")
        str(uuid.UUID(payload["sub"])); str(uuid.UUID(payload["sid"]))
        if not self.store.validate_session(payload["sid"], payload["sub"]):
            raise ValueError("session_revoked_or_expired")
        return payload

    def create_pair(self, user_id: str, provider: str):
        sid = str(uuid.uuid4()); refresh = secrets.token_urlsafe(48); refresh_exp = int(time.time()) + REFRESH_TTL_SECONDS
        self.store.create_session(sid, user_id, provider, refresh_hash(refresh), refresh_exp)
        access, access_exp = self.issue_access(user_id, provider, sid)
        return {"access_token": access, "session_token": access, "refresh_token": refresh, "expires_in": ACCESS_TTL_SECONDS, "expires_at": access_exp, "refresh_expires_at": refresh_exp, "session_id": sid}


class Handler(BaseHTTPRequestHandler):
    server_version = "TeswaAuthShadow/3"

    def log_message(self, fmt, *args):
        print(f"request method={self.command} path={self.path} status_hint={fmt % args}", flush=True)

    def _json(self, status: int, body: dict):
        raw = compact_json(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers(); self.wfile.write(raw)

    def _body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid_body_size")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _bearer(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            raise ValueError("missing_session")
        return auth[7:].strip()

    def do_GET(self):
        if self.path == "/healthz":
            try:
                active = self.server.store.active_count()
            except Exception:
                self._json(503, {"status": "error", "service": "teswa-auth-shadow", "sessionStore": False}); return
            self._json(200, {"status": "ok", "service": "teswa-auth-shadow", "mode": "teswa-auth-durable-shadow", "productionTraffic": False, "supabaseRuntimeDependency": False, "identityUsers": len(self.server.identity.users), "identityMappings": len(self.server.identity.by_provider_hash), "accessTtlSeconds": ACCESS_TTL_SECONDS, "refreshTtlSeconds": REFRESH_TTL_SECONDS, "durableSessions": True, "refreshRotation": True, "passwordAuth": True, "signupBootstrap": True, "confirmationDispatchConfigured": False, "googlePositiveDeferred": True, "activeSessions": active}); return
        if self.path == "/v1/auth/session":
            try:
                p = self.server.signer.verify_access(self._bearer()); user = self.server.store.auth_user(p["sub"])
                self._json(200, {"authenticated": True, "user_id": p["sub"], "provider": p.get("provider"), "session_id": p["sid"], "user": user, "shadow": True})
            except Exception:
                self._json(401, {"error": "invalid_session"})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/v1/auth/google":
            try:
                body = self._body(); token = body.get("id_token")
                if not isinstance(token, str) or not token:
                    raise ValueError("google_token_missing")
                claims = self.server.google.verify(token); user_id = self.server.identity.map_subject("google", claims["sub"])
                if not user_id:
                    self._json(403, {"error": "identity_not_mapped"}); return
                pair = self.server.signer.create_pair(user_id, "google"); user = self.server.store.auth_user(user_id)
                self._json(200, {"authenticated": True, "user_id": user_id, "provider": "google", "user": user, **pair, "shadow": True})
            except ValueError:
                self._json(401, {"error": "invalid_google_token"})
            except Exception:
                self._json(500, {"error": "auth_shadow_internal_error"})
            return

        if self.path in {"/v1/auth/password", "/v1/auth/sign-in/password"}:
            try:
                body = self._body(); email = body.get("email"); password = body.get("password")
                if not isinstance(email, str) or not isinstance(password, str) or not email or not password:
                    raise ValueError("credentials_missing")
                row = self.server.store.verify_email_password(email, password)
                if not row:
                    self._json(401, {"error": "invalid_credentials"}); return
                user_id, confirmed = row
                if not confirmed:
                    self._json(403, {"error": "email_not_confirmed"}); return
                pair = self.server.signer.create_pair(user_id, "email"); user = self.server.store.auth_user(user_id)
                self._json(200, {"authenticated": True, "user_id": user_id, "provider": "email", "user": user, **pair, "shadow": True})
            except ValueError:
                self._json(400, {"error": "invalid_request"})
            except Exception:
                self._json(500, {"error": "auth_shadow_internal_error"})
            return

        if self.path == "/v1/auth/sign-up":
            try:
                body = self._body(); email = body.get("email"); password = body.get("password"); display_name = body.get("display_name")
                if not isinstance(email, str) or not isinstance(password, str) or len(password) < 8 or "@" not in email:
                    self._json(400, {"error": "invalid_signup_input"}); return
                if self.server.store.email_state(email):
                    self._json(409, {"error": "email_already_registered"}); return
                user_id = self.server.store.bootstrap_signup(email, password, display_name if isinstance(display_name, str) else None)
                user = self.server.store.auth_user(user_id)
                self._json(201, {"user": user, "session": None, "confirmation_required": True, "confirmation_delivery": "provider_pending", "shadow": True})
            except Exception:
                self._json(500, {"error": "auth_shadow_internal_error"})
            return

        if self.path == "/v1/auth/resend-confirmation":
            try:
                body = self._body(); email = body.get("email")
                if not isinstance(email, str) or "@" not in email:
                    self._json(400, {"error": "invalid_email"}); return
                self.server.store.resend_confirmation(email)
                self._json(202, {"accepted": True, "confirmation_delivery": "provider_pending"})
            except Exception:
                self._json(202, {"accepted": True, "confirmation_delivery": "provider_pending"})
            return

        if self.path == "/v1/auth/refresh":
            try:
                body = self._body(); old = body.get("refresh_token")
                if not isinstance(old, str) or len(old) < 32:
                    raise ValueError("refresh_missing")
                new = secrets.token_urlsafe(48); refresh_exp = int(time.time()) + REFRESH_TTL_SECONDS
                row = self.server.store.rotate_refresh(refresh_hash(old), refresh_hash(new), refresh_exp)
                if not row:
                    self._json(401, {"error": "invalid_refresh_token"}); return
                sid, user_id, provider = row; access, access_exp = self.server.signer.issue_access(user_id, provider, sid); user = self.server.store.auth_user(user_id)
                self._json(200, {"authenticated": True, "user_id": user_id, "provider": provider, "user": user, "access_token": access, "session_token": access, "refresh_token": new, "expires_in": ACCESS_TTL_SECONDS, "expires_at": access_exp, "refresh_expires_at": refresh_exp, "session_id": sid, "shadow": True})
            except ValueError:
                self._json(401, {"error": "invalid_refresh_token"})
            except Exception:
                self._json(500, {"error": "auth_shadow_internal_error"})
            return

        if self.path == "/v1/auth/logout":
            try:
                p = self.server.signer.verify_access(self._bearer()); ok = self.server.store.revoke_session(p["sid"], p["sub"], "logout")
                if not ok:
                    self._json(401, {"error": "invalid_session"}); return
                self._json(200, {"signed_out": True})
            except Exception:
                self._json(401, {"error": "invalid_session"})
            return

        self._json(404, {"error": "not_found"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bind", default="127.0.0.1"); p.add_argument("--port", type=int, default=3110)
    p.add_argument("--identity-map", required=True); p.add_argument("--google-client-id", required=True); p.add_argument("--session-secret", required=True)
    a = p.parse_args()
    if a.bind != "127.0.0.1" or a.port != 3110:
        raise SystemExit("shadow_bind_guard_failed")
    identity = IdentityMap(a.identity_map); store = PgStore(); signer = SessionSigner(a.session_secret, store)
    server = Server((a.bind, a.port), Handler); server.identity = identity; server.store = store; server.signer = signer; server.google = GoogleVerifier(a.google_client_id)
    print("teswa_auth_shadow=START version=3 bind=127.0.0.1 port=3110 durable_sessions=true password_auth=true signup=true production_traffic=false supabase_dependency=false", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
