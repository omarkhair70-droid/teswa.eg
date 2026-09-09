# Teswa Backend Boundary — B7 Profile / Social Progress

Date: 2026-09-03
Branch: `refactor/backend-boundary-20260903`

## B7.1 — Profile setup + direct-message privacy

Migrated behind `ProfileCoreContract`:

- auth profile setup upsert;
- direct-message privacy read;
- direct-message privacy update.

The Profile Setup screen retains its existing timeout + one-retry behavior and Arabic validation copy.

## B7.2 — Social graph

Added `ProfileSocialContract` capabilities for:

- follow state;
- follow / unfollow;
- followers / following lists;
- block state;
- blocked-user list;
- block / unblock;
- trust metrics;
- badges;
- badge refresh.

Migrated feature modules:

- `lib/user-follows.ts`;
- `lib/user-blocks.ts`;
- `lib/trust-metrics.ts`;
- `lib/badges.ts`;
- `components/profile/ProfileConnectionsScreen.tsx`.

## B7.3 — People directory

Moved People directory profile search, pagination ordering, and active-listing counts into the Profile provider adapter.

`lib/people.ts` is now provider-free.

## B7.4 — Profile image metadata

Media bytes were already behind `MediaStorageContract` in B2.

B7 now also moves profile avatar/cover URL persistence behind
`ProfileCoreContract.setProfileImageUrl()`.

`lib/profile-images.ts` is therefore provider-free end-to-end:

- upload/remove -> Media boundary;
- profile metadata -> Profile boundary.

## Safety / behavior

No provider switch was made.

Supabase remains the active adapter.

Existing product behavior retained:

- UUID identity;
- username uniqueness semantics;
- connection lists;
- block semantics;
- trust/badge RPC behavior;
- People ordering/search;
- profile image rollback cleanup;
- current user-facing Arabic copy.

The backend guard prevents the migrated Profile/Social files from reintroducing direct provider table/RPC access.
