#!/usr/bin/env python3
"""Teswa durable Auth shadow runtime for OCI rehearsal.

Verifies Google ID tokens directly, preserves Teswa UUID identity, and issues
short-lived access tokens backed by rotating durable refresh sessions in local
PostgreSQL. No Supabase dependency and no production traffic switch.
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


class GoogleVerifier:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self._lock = threading.Lock()
        self._certs: dict[str, str] = {}
        self._expires_at = 0.0

    def _refresh_certs(self):
        req = urllib.request.Request(GOOGLE_CERTS_URL, headers={"User-Agent": "teswa-auth-shadow/2"})
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
        try:
            exp = int(claims.get("exp", 0)); iat = int(claims.get("iat", 0))
        except Exception as exc:
            raise ValueError("google_time_claim_invalid") from exc
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
        self.users = set(users); self.by_provider_hash: dict[tuple[str, str], str] = {}
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


class SessionStore:
    def _sql(self, sql: str, **values) -> str:
        args = [PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-F", "|", "-d", DB]
        for key, value in values.items():
            args += ["-v", f"{key}={value}"]
        proc = subprocess.run(args, input=sql.encode(), capture_output=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError("session_store_query_failed")
        return proc.stdout.decode().strip()

    def create(self, sid: str, user_id: str, provider: str, token_hash: str, expires_epoch: int):
        out = self._sql("SELECT teswa_auth.create_session(:'sid'::uuid,:'uid'::uuid,:'provider',:'rh',to_timestamp(:'exp'::bigint));", sid=sid, uid=user_id, provider=provider, rh=token_hash, exp=expires_epoch)
        if out != "t": raise RuntimeError("session_create_failed")

    def rotate(self, old_hash: str, new_hash: str, expires_epoch: int):
        out = self._sql("SELECT session_id,user_id,provider FROM teswa_auth.rotate_refresh(:'old',:'new',to_timestamp(:'exp'::bigint));", old=old_hash, new=new_hash, exp=expires_epoch)
        if not out: return None
        parts = out.split("|")
        if len(parts) != 3: raise RuntimeError("session_rotate_shape")
        return tuple(parts)

    def validate(self, sid: str, user_id: str) -> bool:
        return self._sql("SELECT teswa_auth.validate_session(:'sid'::uuid,:'uid'::uuid);", sid=sid, uid=user_id) == "t"

    def revoke(self, sid: str, user_id: str, reason="logout") -> bool:
        return self._sql("SELECT teswa_auth.revoke_session(:'sid'::uuid,:'uid'::uuid,:'reason');", sid=sid, uid=user_id, reason=reason) == "t"

    def cleanup(self, sid: str) -> bool:
        return self._sql("SELECT teswa_auth.cleanup_revoked_session(:'sid'::uuid);", sid=sid) == "t"

    def active_count(self) -> int:
        return int(self._sql("SELECT teswa_auth.active_session_count();") or "0")


class SessionSigner:
    def __init__(self, secret_path: str, store: SessionStore):
        secret = Path(secret_path).read_bytes().strip()
        if len(secret) < 32: raise SystemExit("session_secret_too_short")
        self.secret = secret; self.store = store

    def issue_access(self, user_id: str, provider: str, sid: str):
        now = int(time.time()); exp = now + ACCESS_TTL_SECONDS
        header = {"alg":"HS256","typ":"JWT"}
        payload = {"ver":2,"iss":"teswa-auth-shadow","aud":"teswa-shadow","sub":user_id,"provider":provider,"sid":sid,"iat":now,"exp":exp,"jti":secrets.token_urlsafe(16),"shadow":True}
        a=b64url_encode(compact_json(header)); b=b64url_encode(compact_json(payload)); sig=hmac.new(self.secret,f"{a}.{b}".encode("ascii"),hashlib.sha256).digest()
        return f"{a}.{b}.{b64url_encode(sig)}", exp

    def verify_access(self, token: str, require_store=True) -> dict:
        parts=token.split(".")
        if len(parts)!=3: raise ValueError("session_malformed")
        expected=hmac.new(self.secret,f"{parts[0]}.{parts[1]}".encode("ascii"),hashlib.sha256).digest()
        try: supplied=b64url_decode(parts[2]); payload=json.loads(b64url_decode(parts[1]))
        except Exception as exc: raise ValueError("session_decode_failed") from exc
        if not hmac.compare_digest(expected,supplied): raise ValueError("session_signature_invalid")
        now=int(time.time())
        if payload.get("iss")!="teswa-auth-shadow" or payload.get("aud")!="teswa-shadow" or payload.get("shadow") is not True or int(payload.get("exp",0))<=now:
            raise ValueError("session_claims_invalid")
        try: str(uuid.UUID(payload["sub"])); str(uuid.UUID(payload["sid"]))
        except Exception as exc: raise ValueError("session_identity_invalid") from exc
        if require_store and not self.store.validate(payload["sid"],payload["sub"]): raise ValueError("session_revoked_or_expired")
        return payload

    def create_pair(self, user_id: str, provider: str):
        sid=str(uuid.uuid4()); refresh=secrets.token_urlsafe(48); refresh_exp=int(time.time())+REFRESH_TTL_SECONDS
        self.store.create(sid,user_id,provider,refresh_hash(refresh),refresh_exp)
        access,access_exp=self.issue_access(user_id,provider,sid)
        return {"access_token":access,"session_token":access,"refresh_token":refresh,"expires_in":ACCESS_TTL_SECONDS,"expires_at":access_exp,"refresh_expires_at":refresh_exp,"session_id":sid}


class Handler(BaseHTTPRequestHandler):
    server_version="TeswaAuthShadow/2"
    def log_message(self, fmt,*args): print(f"request method={self.command} path={self.path} status_hint={fmt % args}",flush=True)
    def _json(self,status:int,body:dict):
        raw=compact_json(body); self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-store"); self.send_header("X-Content-Type-Options","nosniff"); self.end_headers(); self.wfile.write(raw)
    def _body(self):
        try: length=int(self.headers.get("Content-Length","0"))
        except Exception as exc: raise ValueError("invalid_content_length") from exc
        if length<=0 or length>MAX_BODY_BYTES: raise ValueError("invalid_body_size")
        try: return json.loads(self.rfile.read(length).decode())
        except Exception as exc: raise ValueError("invalid_json") from exc
    def _bearer(self):
        auth=self.headers.get("Authorization","")
        if not auth.startswith("Bearer "): raise ValueError("missing_session")
        return auth[7:].strip()
    def do_GET(self):
        if self.path=="/healthz":
            try: active=self.server.store.active_count()
            except Exception: self._json(503,{"status":"error","service":"teswa-auth-shadow","sessionStore":False}); return
            self._json(200,{"status":"ok","service":"teswa-auth-shadow","mode":"google-direct-durable-shadow","productionTraffic":False,"supabaseRuntimeDependency":False,"identityUsers":len(self.server.identity.users),"identityMappings":len(self.server.identity.by_provider_hash),"accessTtlSeconds":ACCESS_TTL_SECONDS,"refreshTtlSeconds":REFRESH_TTL_SECONDS,"durableSessions":True,"refreshRotation":True,"activeSessions":active}); return
        if self.path=="/v1/auth/session":
            try:
                p=self.server.signer.verify_access(self._bearer()); self._json(200,{"authenticated":True,"user_id":p["sub"],"provider":p.get("provider"),"session_id":p["sid"],"shadow":True})
            except Exception: self._json(401,{"error":"invalid_session"})
            return
        self._json(404,{"error":"not_found"})
    def do_POST(self):
        if self.path=="/v1/auth/google":
            try:
                body=self._body(); token=body.get("id_token")
                if not isinstance(token,str) or not token: raise ValueError("google_token_missing")
                claims=self.server.google.verify(token); user_id=self.server.identity.map_subject("google",claims["sub"])
                if not user_id: self._json(403,{"error":"identity_not_mapped"}); return
                pair=self.server.signer.create_pair(user_id,"google"); self._json(200,{"authenticated":True,"user_id":user_id,"provider":"google",**pair,"shadow":True})
            except ValueError: self._json(401,{"error":"invalid_google_token"})
            except Exception: self._json(500,{"error":"auth_shadow_internal_error"})
            return
        if self.path=="/v1/auth/refresh":
            try:
                body=self._body(); old=body.get("refresh_token")
                if not isinstance(old,str) or len(old)<32: raise ValueError("refresh_missing")
                new=secrets.token_urlsafe(48); refresh_exp=int(time.time())+REFRESH_TTL_SECONDS
                row=self.server.store.rotate(refresh_hash(old),refresh_hash(new),refresh_exp)
                if not row: self._json(401,{"error":"invalid_refresh_token"}); return
                sid,user_id,provider=row; access,access_exp=self.server.signer.issue_access(user_id,provider,sid)
                self._json(200,{"authenticated":True,"user_id":user_id,"provider":provider,"access_token":access,"session_token":access,"refresh_token":new,"expires_in":ACCESS_TTL_SECONDS,"expires_at":access_exp,"refresh_expires_at":refresh_exp,"session_id":sid,"shadow":True})
            except ValueError: self._json(401,{"error":"invalid_refresh_token"})
            except Exception: self._json(500,{"error":"auth_shadow_internal_error"})
            return
        if self.path=="/v1/auth/logout":
            try:
                p=self.server.signer.verify_access(self._bearer()); ok=self.server.store.revoke(p["sid"],p["sub"],"logout")
                if not ok: self._json(401,{"error":"invalid_session"}); return
                self._json(200,{"signed_out":True})
            except Exception: self._json(401,{"error":"invalid_session"})
            return
        self._json(404,{"error":"not_found"})


class Server(ThreadingHTTPServer):
    daemon_threads=True; allow_reuse_address=True


def self_test(identity: IdentityMap, signer: SessionSigner, store: SessionStore):
    user_id=sorted(identity.users)[0]; sid=str(uuid.uuid4()); r1=secrets.token_urlsafe(48); r2=secrets.token_urlsafe(48); exp=int(time.time())+3600
    store.create(sid,user_id,"google",refresh_hash(r1),exp)
    if not store.validate(sid,user_id): raise SystemExit("auth_session_self_test_create_validate_failed")
    row=store.rotate(refresh_hash(r1),refresh_hash(r2),exp)
    if not row or row[0]!=sid or row[1]!=user_id: raise SystemExit("auth_session_self_test_rotate_failed")
    if store.rotate(refresh_hash(r1),refresh_hash(secrets.token_urlsafe(48)),exp) is not None: raise SystemExit("auth_session_self_test_replay_accepted")
    access,_=signer.issue_access(user_id,"google",sid); signer.verify_access(access)
    if not store.revoke(sid,user_id,"self_test"): raise SystemExit("auth_session_self_test_revoke_failed")
    try: signer.verify_access(access); raise SystemExit("auth_session_self_test_revoked_access_accepted")
    except ValueError: pass
    if not store.cleanup(sid): raise SystemExit("auth_session_self_test_cleanup_failed")
    print("auth_session_self_test=PASS"); print("refresh_rotation=PASS"); print("refresh_replay_rejected=PASS"); print("logout_revocation=PASS"); print("durable_session_validation=PASS")


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument("--bind",default="127.0.0.1"); p.add_argument("--port",type=int,default=3110); p.add_argument("--identity-map",required=True); p.add_argument("--google-client-id",required=True); p.add_argument("--session-secret",required=True); p.add_argument("--self-test",action="store_true"); a=p.parse_args()
    identity=IdentityMap(a.identity_map); store=SessionStore(); signer=SessionSigner(a.session_secret,store)
    if a.self_test: self_test(identity,signer,store); return
    if a.bind!="127.0.0.1" or a.port!=3110: raise SystemExit("shadow_bind_guard_failed")
    server=Server((a.bind,a.port),Handler); server.identity=identity; server.store=store; server.signer=signer; server.google=GoogleVerifier(a.google_client_id)
    print("teswa_auth_shadow=START version=2 bind=127.0.0.1 port=3110 durable_sessions=true production_traffic=false supabase_dependency=false",flush=True); server.serve_forever()

if __name__=="__main__": main()
