#!/usr/bin/env python3
"""Bounded HTTP service for authenticated Oracle domain operations."""
from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from oracle_domain_read import ApiError, MarketplaceReadApi
from oracle_media import MediaApi
from oracle_marketplace_write import MarketplaceWriteApi
from oracle_marketplace_lifecycle import MarketplaceLifecycleApi
from oracle_marketplace_edit import MarketplaceEditApi
from oracle_exchange import ExchangeApi
from oracle_exchange_read import ExchangeReadApi
from oracle_profiles import ProfilesApi
from oracle_notifications import NotificationsApi
from oracle_reviews import ReviewsApi
from oracle_direct_messaging import DirectMessagingApi
from oracle_contextual_messaging import ContextualMessagingApi
from oracle_stories import StoriesApi

MAX_RESPONSE = 1024 * 1024
MAX_BODY = 128 * 1024


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

    def dispatch(self):
        if self.path == '/healthz':
            self.send_json(200, {'status': 'ok', 'service': 'teswa-domain-shadow',
                                 'productionTraffic': False,
                                 'supabaseRuntimeDependency': False})
            return
        values = self.headers.get_all('Authorization') or []
        if len(values) != 1:
            self.send_json(401, {'error': 'invalid_session'})
            return
        body = None
        if self.command in ('POST', 'DELETE'):
            if self.headers.get('Transfer-Encoding') is not None or self.headers.get_content_type() != 'application/json':
                self.send_json(415, {'error': 'json_body_required'})
                return
            lengths = self.headers.get_all('Content-Length') or []
            try:
                length = int(lengths[0]) if len(lengths) == 1 else -1
            except ValueError:
                length = -1
            if length <= 0 or length > MAX_BODY:
                self.send_json(413, {'error': 'invalid_body_size'})
                return
            try:
                body = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                self.send_json(400, {'error': 'invalid_json_object'})
                return
        try:
            if self.path.startswith('/v1/media/'):
                status, body = self.server.media.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/profiles/') or self.path.startswith('/v1/people'):
                status, body = self.server.profiles.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/notifications'):
                status, body = self.server.notifications.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/reviews'):
                status, body = self.server.reviews.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/direct/'):
                status, body = self.server.direct_messaging.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/contextual/'):
                status, body = self.server.contextual_messaging.handle(self.command, self.path, values[0], body)
            elif self.path.startswith('/v1/stories'):
                status, body = self.server.stories.handle(self.command, self.path, values[0], body)
            elif self.path == '/v1/offers' or self.path.startswith('/v1/offers/') or self.path.startswith('/v1/deals/'):
                if self.command == 'GET':
                    status, body = self.server.exchange_read.handle(self.command, self.path, values[0])
                else:
                    status, body = self.server.exchange.handle(self.command, self.path, values[0], body)
            elif urlsplit(self.path).path.endswith(('/edit', '/edit/images', '/edit/images/plan')) and self.path.startswith('/v1/marketplace/items/'):
                status, body = self.server.marketplace_edit.handle(self.command, self.path, values[0], body)
            elif urlsplit(self.path).path.endswith(('/archive', '/reactivate', '/delete-archived', '/images/urls')) and self.path.startswith('/v1/marketplace/items/'):
                status, body = self.server.marketplace_lifecycle.handle(self.command, self.path, values[0], body)
            elif self.command != 'GET':
                status, body = self.server.marketplace_write.handle(self.command, self.path, values[0], body)
            else:
                status, body = self.server.api.handle(self.command, self.path, values[0])
        except ApiError as exc:
            self.send_json(exc.status, {'error': exc.code})
            return
        except Exception:
            self.send_json(500, {'error': 'domain_internal_error'})
            return
        self.send_json(status, body)

    do_GET = dispatch
    do_POST = dispatch
    do_DELETE = dispatch


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, api=None, media=None, marketplace_write=None, exchange=None, exchange_read=None, profiles=None, notifications=None, reviews=None, marketplace_lifecycle=None, marketplace_edit=None, direct_messaging=None, contextual_messaging=None, stories=None):
        super().__init__(address, Handler)
        self.api = api or MarketplaceReadApi()
        self.media = media or MediaApi()
        self.marketplace_write = marketplace_write or MarketplaceWriteApi()
        self.marketplace_lifecycle = marketplace_lifecycle or MarketplaceLifecycleApi()
        self.marketplace_edit = marketplace_edit or MarketplaceEditApi()
        self.exchange = exchange or ExchangeApi()
        self.exchange_read = exchange_read or ExchangeReadApi()
        self.profiles = profiles or ProfilesApi()
        self.notifications = notifications or NotificationsApi()
        self.reviews = reviews or ReviewsApi()
        self.direct_messaging = direct_messaging or DirectMessagingApi()
        self.contextual_messaging = contextual_messaging or ContextualMessagingApi()
        self.stories = stories or StoriesApi()
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
