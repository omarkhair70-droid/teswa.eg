#!/usr/bin/env python3
"""Private rehearsal gateway from the existing Core API listener to Auth.

Only explicitly supported routes are forwarded. No database credentials, client
identity headers, arbitrary URLs, redirects, or production routing are involved.
"""
import argparse
import http.client
import ipaddress
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 128 * 1024
ROUTES = {
    ('GET', '/v1/auth/healthz'): '/healthz',
    ('GET', '/v1/auth/session'): '/v1/auth/session',
    **{('POST', '/v1/auth/' + name): '/v1/auth/' + name for name in (
        'google', 'password', 'sign-in/password', 'refresh', 'logout',
    )},
}
DOMAIN_GET = (
    re.compile(r'^/v1/marketplace/feed(?:\?[^#]*)?$'),
    re.compile(r'^/v1/marketplace/items/[0-9a-fA-F-]{36}$'),
    re.compile(r'^/v1/marketplace/items/[0-9a-fA-F-]{36}/detail$'),
    re.compile(r'^/v1/marketplace/owners/[0-9a-fA-F-]{36}/active(?:\?[^#]*)?$'),
)
# The current Auth service discards confirmation delivery tokens. Do not let the
# ingress claim a signup/resend succeeded until real delivery is implemented.
PENDING_DELIVERY = {'/v1/auth/sign-up', '/v1/auth/resend-confirmation'}


class Handler(BaseHTTPRequestHandler):
    server_version = 'TeswaPrivateGateway/1'

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, fmt, *args):
        # Paths may contain credentials in malformed requests; never log them.
        pass

    def send_json(self, status, value):
        self.send_bytes(status, json.dumps(value, separators=(',', ':')).encode())

    def send_bytes(self, status, body):
        self.close_connection = True
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)

    def dispatch(self):
        if self.command == 'GET' and self.path == '/healthz':
            self.send_json(200, {'status': 'ok', 'service': 'teswa-api-shadow',
                                'productionTraffic': False, 'supabaseRuntimeDependency': False})
            return
        if self.path in PENDING_DELIVERY:
            self.send_json(503, {'error': 'confirmation_delivery_not_configured'})
            return
        path = ROUTES.get((self.command, self.path))
        upstream_port = self.server.auth_port
        upstream_name = 'auth'
        if path is None and self.command == 'GET' and any(rule.fullmatch(self.path) for rule in DOMAIN_GET):
            path = self.path
            upstream_port = self.server.domain_port
            upstream_name = 'domain'
        if path is None:
            self.send_json(404, {'error': 'not_found'})
            return
        if self.headers.get('Transfer-Encoding') is not None:
            self.send_json(400, {'error': 'unsupported_transfer_encoding'})
            return
        lengths = self.headers.get_all('Content-Length') or []
        if len(lengths) > 1:
            self.send_json(400, {'error': 'invalid_content_length'})
            return
        try:
            length = int(lengths[0]) if lengths else 0
        except ValueError:
            self.send_json(400, {'error': 'invalid_content_length'})
            return
        if length < 0 or length > MAX_BODY or (self.command == 'GET' and length):
            self.send_json(413, {'error': 'invalid_body_size'})
            return
        if self.command == 'POST' and (
            not length or self.headers.get_content_type() != 'application/json'
        ):
            self.send_json(415, {'error': 'json_body_required'})
            return
        auth_values = self.headers.get_all('Authorization') or []
        if len(auth_values) > 1:
            self.send_json(400, {'error': 'ambiguous_authorization'})
            return
        body = self.rfile.read(length) if length else None
        if length:
            try:
                if not isinstance(json.loads(body), dict):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError):
                self.send_json(400, {'error': 'invalid_json_object'})
                return
        headers = {'Content-Type': 'application/json', 'Connection': 'close'}
        if auth_values:
            headers['Authorization'] = auth_values[0]
        conn = http.client.HTTPConnection('127.0.0.1', upstream_port, timeout=8)
        try:
            conn.request(self.command, path, body=body, headers=headers)
            response = conn.getresponse()
            payload = response.read(MAX_BODY + 1)
            if len(payload) > MAX_BODY or response.status in range(300, 400):
                raise ValueError('invalid_upstream_response')
            if not isinstance(json.loads(payload), dict):
                raise ValueError('invalid_upstream_json')
            self.send_bytes(response.status, payload)
        except (OSError, ValueError, http.client.HTTPException):
            self.send_json(502, {'error': upstream_name + '_upstream_unavailable'})
        finally:
            conn.close()

    do_GET = dispatch
    do_POST = dispatch


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, auth_port=3110, domain_port=3130):
        super().__init__(address, Handler)
        self.auth_port = auth_port
        self.domain_port = domain_port
        self.slots = threading.BoundedSemaphore(16)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('port', type=int)
    p.add_argument('--bind', required=True)
    p.add_argument('--directory', default='/srv')  # existing service argument
    a = p.parse_args()
    ip = ipaddress.ip_address(a.bind)
    if not ip.is_private or ip.is_unspecified or ip.is_multicast:
        raise SystemExit('Requires a specific private or loopback bind address')
    Server((a.bind, a.port)).serve_forever()


if __name__ == '__main__':
    main()
