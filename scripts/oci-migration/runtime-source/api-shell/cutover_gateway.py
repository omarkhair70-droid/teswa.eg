#!/usr/bin/env python3
"""Persistent Teswa cutover gateway wrapper used on Oracle Core.

This intentionally reuses the canonical shadow_gateway router while pinning the
systemd cutover upstreams:
  auth     -> 127.0.0.1:3110
  domain   -> 127.0.0.1:3130
  realtime -> 127.0.0.1:3120

The public Tailscale Funnel terminates TLS and proxies to this gateway on
127.0.0.1:4140. No database credentials or provider secrets belong here.
"""

import shadow_gateway


if __name__ == "__main__":
    shadow_gateway.Server(
        ("127.0.0.1", 4140),
        auth_port=3110,
        domain_port=3130,
        realtime_port=3120,
    ).serve_forever()
