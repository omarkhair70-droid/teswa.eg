# Teswa Supabase -> OCI Semantic Verification Matrix

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`

## Purpose

Schema/data parity is necessary but not sufficient.

Teswa currently owns provider-neutral contracts for Auth, Media, Profile,
Marketplace, Offers/Deals, Messaging, and Notifications. Lane 4 will use those
contracts as the behavioral comparison surface instead of requiring OCI to copy
Supabase wire protocols or internal schemas.

Machine-readable scenario catalog:

`scripts/oci-migration/semantic-verification-scenarios.json`

Generic normalized result comparator:

`scripts/oci-migration/compare-shadow-contract-results.py`

## Gate classes

### Read shadow

Safe production pattern:

1. execute the normal Supabase provider read;
2. execute OCI read through the same Teswa contract;
3. return the Supabase result to the user;
4. compare OCI result out-of-band;
5. record mismatch;
6. never repair drift by mutating Supabase source.

Suitable for profile, marketplace, inbox/history, notifications, trust/badges,
and other non-mutating contract surfaces.

### Controlled write rehearsal

Do not dual-write normal production traffic.

Write semantics such as publish, offer transitions, message send, preference
updates, and media upload/remove should be exercised in an isolated rehearsal
environment using known fixtures and then compared for:

- returned domain result/error;
- resulting rows/state;
- side effects;
- authorization;
- notification/realtime effects.

### Runtime

Realtime, push, scheduled reminders, and Auth state events require timing/event
verification, not only row comparison.

### Destructive rehearsal only

Account deletion must never be shadow-executed against real production users.
Use dedicated rehearsal identities and verify DB + Storage cleanup semantics.

## Non-negotiable comparisons

### Auth

- same Teswa user UUID;
- same success/failure classification;
- same Google/email sign-in continuity;
- session refresh/sign-out state behavior;
- no Supabase provider types leaking into feature-facing result.

### Media

All nine `MediaPurpose` values:

- preserve logical object key;
- byte parity;
- max-size / `file_too_large` behavior;
- upload progress semantics for Stories;
- public URL behavior for public product surfaces;
- signed/private access behavior for private media;
- remove/rollback behavior;
- existing public Supabase URL -> logical object-key compatibility.

### Marketplace/Profile

- IDs and ownership;
- banned/non-active filtering;
- ordering/pagination;
- nearby filtering;
- username uniqueness;
- follow/block semantics;
- trust/badge result shape;
- archive/reactivate/delete state rules.

### Offers/Deals

- blocked/invalid-item cases;
- invalid-state transitions;
- accept creates/returns correct deal identity;
- no duplicate state/notification side effects;
- deal read/message/completion semantics.

### Messaging/Realtime

- blocked/unauthorized send/start behavior;
- message identity/order;
- read/typing/reaction state;
- delete authorization;
- attachment behavior;
- event types;
- reconnect/final-state convergence;
- no duplicate message delivery.

### Notifications/Workers

- unread/read behavior;
- preference validation;
- push device register/disable;
- exactly-once user-visible push intent;
- smart-reminder reserve/dedupe/quiet-hours;
- no duplicate shadow push delivery.

## Normalization rule

Provider-generated signed URLs, transport metadata, or other explicitly
non-domain fields can differ.

They may only be ignored through an explicit per-scenario rule.

Never normalize away:

- IDs;
- authorization outcome;
- result/error code;
- item/message ordering when contract-visible;
- status/state transition;
- counts;
- side effects.

## Production readiness linkage

`evaluate-cutover-readiness.py` keeps semantic gates separate because the
generic JSON comparator cannot itself prove event timing, push delivery, or
rollback.

A scenario matrix can be green while production remains blocked by missing
runtime/rollback evidence.
