#!/usr/bin/env python3
"""Teswa Google auth shadow runtime.

Shadow-only service: verifies Google RS256 ID tokens directly against Google's
published certs, maps provider subjects to the already-verified Teswa identity
anchor, and issues short-lived Teswa shadow sessions. It never contacts
Supabase and does not carry production traffic.
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
CERT_CACHE_TTL_SECONDS = 3600
SESSION_TTL_SECONDS = 900
MAX_BODY_BYTES = 128 * 1024


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * ((4 - len(value) % 4) % 4))


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def compact_json(value) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


class GoogleVerifier:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self._lock = threading.Lock()
        self._certs = {}
        self._expires_at = 0.0

    def _refresh_certs(self):
        req = urllib.request.Request(GOOGLE_CERTS_URL, headers={"User-Agent": "teswa-auth-shadow/1"})
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
        pub = subprocess.run(
            ["openssl", "x509", "-pubkey", "-noout"],
            input=cert_pem.encode("utf-8"), capture_output=True, check=False,
        )
        if pub.returncode != 0 or b"BEGIN PUBLIC KEY" not in pub.stdout:
            raise ValueError("google_cert_parse_failed")
        with tempfile.NamedTemporaryFile(mode="wb", delete=True) as pubf, tempfile.NamedTemporaryFile(mode="wb", delete=True) as sigf:
            pubf.write(pub.stdout); pubf.flush()
            sigf.write(signature); sigf.flush()
            check = subprocess.run(
                ["openssl", "dgst", "-sha256", "-verify", pubf.name, "-signature", sigf.name],
                input=signing_input, capture_output=True, check=False,
            )
        if check.returncode != 0:
            raise ValueError("google_signature_invalid")

    def verify(self, token: str) -> dict:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("google_token_malformed")
        try:
            header = json.loads(b64url_decode(parts[0]))
            claims = json.loads(b64url_decode(parts[1]))
            signature = b64url_decode(parts[2])
        except Exception as exc:
            raise ValueError("google_token_decode_failed") from exc
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError("google_token_header_invalid")
        cert = self._get_cert(header["kid"])
        self._verify_signature(f"{parts[0]}.{parts[1]}".encode("ascii"), signature, cert)

        now = int(time.time())
        aud = claims.get("aud")
        aud_ok = self.client_id in aud if isinstance(aud, list) else aud == self.client_id
        if not aud_ok:
            raise ValueError("google_audience_invalid")
        if claims.get("iss") not in GOOGLE_ISSUERS:
            raise ValueError("google_issuer_invalid")
        try:
            exp = int(claims.get("exp", 0))
            iat = int(claims.get("iat", 0))
        except Exception as exc:
            raise ValueError("google_time_claim_invalid") from exc
        if exp <= now - 30:
            raise ValueError("google_token_expired")
        if iat > now + 300:
            raise ValueError("google_token_future_iat")
        sub = claims.get("sub")
        if not isinstance(sub, str) or not sub:
            raise ValueError("google_subject_missing")
        return claims


class IdentityMap:
    def __init__(self, path: str):
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        users = raw.get("users") or []
        identities = raw.get("identities") or []
        if len(users) != 32 or len(identities) != 32:
            raise SystemExit("identity_map_count_mismatch")
        self.users = set(users)
        self.by_provider_hash = {}
        for row in identities:
            key = (row["provider"], row["subject_sha256"])
            if key in self.by_provider_hash:
                raise SystemExit("duplicate_identity_mapping")
            self.by_provider_hash[key] = row["user_id"]
        if not set(self.by_provider_hash.values()).issubset(self.users):
            raise SystemExit("identity_map_orphan")

    def map_subject(self, provider: str, subject: str):
        digest = hashlib.sha256(f"{provider}:{subject}".encode("utf-8")).hexdigest()
        return self.by_provider_hash.get((provider, digest))


class SessionSigner:
    def __init__(self, secret_path: str):
        secret = Path(secret_path).read_bytes().strip()
        if len(secret) < 32:
            raise SystemExit("session_secret_too_short")
        self.secret = secret

    def issue(self, user_id: str, provider: str) -> str:
        now = int(time.time())
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "ver": 1,
            "iss": "teswa-auth-shadow",
            "aud": "teswa-shadow",
            "sub": user_id,
            "provider": provider,
            "iat": now,
            "exp": now + SESSION_TTL_SECONDS,
            "jti": secrets.token_urlsafe(16),
            "shadow": True,
        }
        a = b64url_encode(compact_json(header))
        b = b64url_encode(compact_json(payload))
        sig = hmac.new(self.secret, f"{a}.{b}".encode("ascii"), hashlib.sha256).digest()
        return f"{a}.{b}.{b64url_encode(sig)}"

    def verify(self, token: str) -> dict:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("session_malformed")
        expected = hmac.new(self.secret, f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
        try:
            supplied = b64url_decode(parts[2])
            payload = json.loads(b64url_decode(parts[1]))
        except Exception as exc:
            raise ValueError("session_decode_failed") from exc
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("session_signature_invalid")
        now = int(time.time())
        if payload.get("iss") != "teswa-auth-shadow" or payload.get("aud") != "teswa-shadow":
            raise ValueError("session_claims_invalid")
        if int(payload.get("exp", 0)) <= now:
            raise ValueError("session_expired")
        if payload.get("shadow") is not True:
            raise ValueError("session_not_shadow")
        return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "TeswaAuthShadow/1"

    def log_message(self, fmt, *args):
        # Avoid request bodies, Authorization headers and tokens in logs.
        print(f"request method={self.command} path={self.path} status_hint={fmt % args}", flush=True)

    def _json(self, status: int, body: dict):
        raw = compact_json(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("invalid_content_length") from exc
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid_body_size")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            raise ValueError("invalid_json") from exc

    def do_GET(self):
        if self.path == "/healthz":
            self._json(200, {
                "status": "ok",
                "service": "teswa-auth-shadow",
                "mode": "google-direct-shadow",
                "productionTraffic": False,
                "supabaseRuntimeDependency": False,
                "identityUsers": len(self.server.identity.users),
                "identityMappings": len(self.server.identity.by_provider_hash),
                "sessionTtlSeconds": SESSION_TTL_SECONDS,
            })
            return
        if self.path == "/v1/auth/session":
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                self._json(401, {"error": "missing_session"}); return
            try:
                payload = self.server.signer.verify(auth[7:].strip())
                self._json(200, {"authenticated": True, "user_id": payload["sub"], "provider": payload.get("provider"), "shadow": True})
            except Exception:
                self._json(401, {"error": "invalid_session"})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/auth/google":
            self._json(404, {"error": "not_found"}); return
        try:
            body = self._body()
            token = body.get("id_token")
            if not isinstance(token, str) or not token:
                raise ValueError("google_token_missing")
            claims = self.server.google.verify(token)
            user_id = self.server.identity.map_subject("google", claims["sub"])
            if not user_id:
                self._json(403, {"error": "identity_not_mapped"}); return
            session = self.server.signer.issue(user_id, "google")
            self._json(200, {
                "authenticated": True,
                "user_id": user_id,
                "provider": "google",
                "session_token": session,
                "expires_in": SESSION_TTL_SECONDS,
                "shadow": True,
            })
        except ValueError:
            self._json(401, {"error": "invalid_google_token"})
        except Exception:
            self._json(500, {"error": "auth_shadow_internal_error"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bind", default="127.0.0.1")
    p.add_argument("--port", type=int, default=3110)
    p.add_argument("--identity-map", required=True)
    p.add_argument("--google-client-id", required=True)
    p.add_argument("--session-secret", required=True)
    args = p.parse_args()
    if args.bind != "127.0.0.1" or args.port != 3110:
        raise SystemExit("shadow_bind_guard_failed")

    server = Server((args.bind, args.port), Handler)
    server.identity = IdentityMap(args.identity_map)
    server.google = GoogleVerifier(args.google_client_id)
    server.signer = SessionSigner(args.session_secret)
    print("teswa_auth_shadow=START bind=127.0.0.1 port=3110 production_traffic=false supabase_dependency=false", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
