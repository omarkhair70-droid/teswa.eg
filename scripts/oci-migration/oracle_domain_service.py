#!/usr/bin/env python3
"""Bounded HTTP service for authenticated Oracle domain operations."""
from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from oracle_domain_read import ApiError, MarketplaceReadApi

MAX_RESPONSE = 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = 'TeswaOracleDomain/1'

    def log_message(self, *_args):
        # Request targets may contain malformed secrets. Do not log them.
        pass

    def send_json(self, status: int, value: dict):
        raw = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
        if len(raw) > MAX_RESPONSE:
            status, raw = 503, b'{"error":"response_too_large"}'
        self.close_connection = True
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/healthz':
            self.send_json(200, {'status': 'ok', 'service': 'teswa-domain-shadow',
                                 'productionTraffic': False,
                                 'supabaseRuntimeDependency': False})
            return
        values = self.headers.get_all('Authorization') or []
        if len(values) != 1:
            self.send_json(401, {'error': 'invalid_session'})
            return
        try:
            status, body = self.server.api.handle('GET', self.path, values[0])
        except ApiError as exc:
            self.send_json(exc.status, {'error': exc.code})
            return
        except Exception:
            self.send_json(500, {'error': 'domain_internal_error'})
            return
        self.send_json(status, body)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, api=None):
        super().__init__(address, Handler)
        self.api = api or MarketplaceReadApi()
        self.slots = threading.BoundedSemaphore(24)

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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=3130)
    args = parser.parse_args()
    if args.bind != '127.0.0.1':
        raise SystemExit('domain service must remain loopback-only')
    Server((args.bind, args.port)).serve_forever()


if __name__ == '__main__':
    main()
