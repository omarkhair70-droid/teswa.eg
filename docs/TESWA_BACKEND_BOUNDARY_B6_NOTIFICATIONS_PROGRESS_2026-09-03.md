# Teswa Backend Boundary — B6 Notifications Progress

Date: 2026-09-03
Branch: `refactor/backend-boundary-20260903`

## Cross-lane alignment checked before B6

### Lane 3 — OCI platform

Current OCI work establishes:

- one private application media bucket: `teswa-media`;
- one private/versioned backup bucket: `teswa-backups`;
- Teswa-first capacity policy;
- guarded Nova resize path to release 1 OCPU / 6 GB for Teswa after preflight;
- no production cutover yet.

### Lane 4 — Supabase -> OCI migration

Current migration work establishes:

- preserve existing user UUIDs exactly;
- Supabase remains authoritative until controlled cutover;
- use shadow/parity verification instead of permanent dual writes;
- map the nine logical media purposes into the private `teswa-media` bucket using prefixes;
- rebuild notification fanout/runtime behavior behind Teswa-owned workers/contracts rather than copying Supabase-specific `pg_net`/HTTP transport literally.

B6 follows these invariants.

## Slice B6.1 — Notifications adapter and runtime

Added concrete Supabase implementation for `NotificationsContract` and exposed
`teswaBackendRuntime.notifications`.

Provider-specific implementation now owns:

- notification table reads;
- unread notification count;
- read / mark-all-read writes;
- notification preferences RPCs;
- device timezone RPC;
- push device registration / disable RPCs;
- `create_notification` dispatch RPC.

## Slice B6.2 — App notification surfaces

Migrated off direct Supabase access:

- `lib/notifications.ts`;
- `lib/notification-preferences.ts`;
- `lib/push-notifications.ts`;
- `lib/unread-badges.tsx`.

Provider type leakage was removed from the public notification APIs:
`PostgrestError` is no longer part of Teswa-facing result types.

Existing product behavior is preserved:

- notification routing;
- Arabic error copy;
- preference defaults;
- quiet hours;
- device timezone sync;
- Expo permission/token handling;
- Android notification channel setup;
- local token persistence.

## Slice B6.3 — Offers / Deals notification dispatch closure

The B4 feature modules previously retained one intentional provider dependency:
`create_notification`.

That residual dependency is now removed.

- `lib/offers.ts` dispatches through `teswaBackendRuntime.notifications`.
- `lib/deals.ts` dispatches through `teswaBackendRuntime.notifications`.

As a result, Offers and Deals feature modules are now provider-free for both
lifecycle transport and notification side effects.

## Slice B6.4 — Unread deal badge

Added `DealLifecycleContract.getUnreadCount()` and moved
`get_unread_deal_messages_count` into the Supabase Deals adapter.

`lib/unread-badges.tsx` no longer imports the Supabase client.

## Architecture result

Notification creation is a Teswa domain capability now.

This is important for OCI because the source implementation currently couples
database writes, triggers, HTTP fanout, and push delivery. The future OCI path
may implement the same Teswa notification contract using API + worker/event
transport without requiring the mobile app to know how delivery is performed.

## Explicitly not done

- no OCI notifications worker activation;
- no push provider switch;
- no production routing change;
- no Supabase trigger deletion;
- no `pg_net`/cron/Vault mutation;
- no duplicate notification delivery in shadow mode.

Supabase remains the active production adapter.
