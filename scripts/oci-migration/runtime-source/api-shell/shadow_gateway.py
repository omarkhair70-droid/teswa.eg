#!/usr/bin/env python3
"""Canonical Teswa Oracle API gateway entrypoint.

The original reviewed gateway implementation is kept in shadow_gateway_base.py.
This entrypoint carries only the proven live Oracle routing deltas: Core service
ports, encoded policy-key commas, and the authenticated Offers/Deals GET surface.
"""
import re
import shadow_gateway_base as base

# Keep the reviewed base allow-list and add only the routes proven on the live
# Oracle preview. The domain handlers still perform strict query validation.
base.DOMAIN_GET = base.DOMAIN_GET + (
    re.compile(r'^/v1/policies/acceptances\?userId=[0-9a-fA-F-]{36}&keys=(?:[a-z_]|,|%2[Cc])+$'),
    re.compile(r'^/v1/offers(?:\?[^#]*)?$'),
    re.compile(r'^/v1/offers/owned-active-items(?:\?[^#]*)?$'),
    re.compile(r'^/v1/offers/items/[0-9a-fA-F-]{36}$'),
    re.compile(r'^/v1/offers/[0-9a-fA-F-]{36}$'),
    re.compile(r'^/v1/deals/(?:inbox(?:\?[^#]*)?|unread-count)$'),
    re.compile(r'^/v1/deals/[0-9a-fA-F-]{36}$'),
    re.compile(r'^/v1/deals/[0-9a-fA-F-]{36}/confirmations$'),
    re.compile(r'^/v1/deals/[0-9a-fA-F-]{36}/messages(?:\?[^#]*)?$'),
    re.compile(r'^/v1/deals/[0-9a-fA-F-]{36}/reviews\?[^#]+$'),
    re.compile(r'^/v1/deals/[0-9a-fA-F-]{36}/messages/count\?[^#]+$'),
)


class CanonicalServer(base.Server):
    """Use the proven live Core ports while preserving the reviewed gateway."""

    def __init__(self, address, auth_port=4110, domain_port=4130, realtime_port=4120):
        super().__init__(address, auth_port=auth_port, domain_port=domain_port,
                         realtime_port=realtime_port)


# base.main resolves Server from its module globals when invoked, so replacing
# it here keeps the original bind validation and CLI surface intact.
base.Server = CanonicalServer

if __name__ == '__main__':
    base.main()
