# Teswa Native Android Master

This document is the living engineering handoff for the native Android replacement client. The Expo application remains a behavioral and product reference only until native parity and release acceptance are proven.

## Identity and release invariants

- Repository: `omarkhair70-droid/teswa.eg`
- Canonical integration branch: `chore/oracle-runtime-cutover-prep-20260910`
- Native project: `android-native/`
- Package and application ID: `com.teswa.mobile`
- Current version: `versionCode 26`, `versionName 1.0.11`
- Toolchain: JDK 17, Gradle 9.6.0 in CI, Kotlin 2.3.21, Android Gradle Plugin 9.4.0
- A production AAB must use the existing Play signing identity and must update the installed Teswa app without uninstalling it.
- Native runtime code must not depend on Expo, Expo Updates, or Supabase.

## Current native architecture

`AppContainer` is the composition root. It owns the shared Oracle transport and constructs authentication, account-gate, and marketplace clients.

The current package responsibilities are:

- `app/`: application composition and, as migration continues, app/navigation state.
- `core/network/`: centralized Oracle base URL, timeouts, headers, JSON decoding, transport failures, authenticated execution, one refresh and one retry after HTTP 401.
- `auth/`: Google Credential Manager, Oracle auth exchange, encrypted session storage, refresh coordination, restore, and logout.
- `account/`: profile-completeness and required-policy gate.
- `home/`: marketplace feed, optional permission-aware nearby discovery, pagination, item detail models and UI.
- `feature/additem/`: listing draft recovery, media selection/upload, publish orchestration, and native creation UI.
- `feature/messages/`: deal inbox, chronological text/voice conversation, read state, reconnect polling, and composer state.
- `feature/direct/`: privacy-aware compose entry, first-message requests, inbox, accept/ignore, read state, and text/voice conversation.
- `feature/contextual/`: story-context reply inbox, chronological text/voice threads, read state, notification dispatch, and reconnect polling.
- `feature/stories/`: home story rail, signed image/video viewer, view/like mutations, contextual text/voice replies, streaming publish, and owned-story management.
- `feature/voice/`: permission-aware AAC capture, review/cancel/send state, streaming private-media upload/cleanup, signed playback, and shared voice UI.
- `feature/offers/`: offer creation, incoming/sent inbox, receiver decisions, and accepted-deal routing.
- `feature/profile/`: own-profile editing, streaming avatar/cover replacement and cleanup, owned-listing presentation, and guarded listing lifecycle actions.
- `feature/settings/`: direct-message privacy, notification preferences, block-list management, sign-out, and confirmed account deletion.
- `feature/notifications/`: in-app activity center, unread mutation, Firebase Installation ID registration, permission-aware native push display, native destination mapping, and best-effort domain-event dispatch.
- `shell/`: authenticated bottom-navigation shell plus validated internal, `teswa://`, and Teswa HTTPS route handling.
- `ui/`: shared UI utilities and the first Teswa light/dark color, type, and shape system; this grows through real native screens rather than an Expo visual port.

New features should move toward `feature/<name>/` as they are added or materially refactored. Existing packages should be moved only in coherent slices; package churn alone is not useful architecture.

## Networking and session contract

All Oracle API traffic uses the shared `OracleTransport` boundary. The default implementation owns:

- `BuildConfig.TESWA_API_BASE_URL`
- 8-second connect and 12-second read timeouts
- JSON request/response handling
- `Accept`, `Content-Type`, `Authorization`, and native `User-Agent` headers
- explicit offline, timeout, I/O, and invalid-JSON outcomes

Authenticated requests run through `AuthenticatedOracleExecutor`:

1. ensure the supplied access token is usable;
2. send the Oracle request;
3. on the first 401, refresh once and persist rotated tokens;
4. retry the original request once with the rotated access token;
5. return a session-expired result if refresh is invalid, or the second response without another retry.

Refresh is mutex-protected. Concurrent feature requests reuse a newly rotated stored session instead of racing multiple refresh calls. Network failures do not clear an otherwise valid local session and must not be reported as Google-provider failures.

## Migrated features and Oracle contracts

| Native feature | Status | Oracle endpoints |
| --- | --- | --- |
| Google sign-in and session | Implemented; real-device acceptance remains open | `POST /v1/auth/google`, `POST /v1/auth/refresh`, `GET /v1/auth/session`, `POST /v1/auth/logout` |
| Profile completeness gate | Implemented | `GET /v1/profiles/me`, `POST /v1/profiles/setup` |
| Required-policy gate | Implemented | `GET /v1/policies/acceptances`, `POST /v1/policies/acceptances` |
| Home marketplace feed | Implemented | `GET /v1/marketplace/feed` |
| Nearby marketplace discovery | Implemented locally; device acceptance remains open | `GET /v1/marketplace/nearby`, one-shot coarse/fine native location |
| Item detail and images | Implemented | `GET /v1/marketplace/items/{itemId}/detail` |
| Add Item publishing | Implemented locally; device/production acceptance remains open | categories, media grant/PUT/complete/cleanup, marketplace publish |
| Deal inbox, text/voice coordination, and completion | Implemented locally; realtime/device acceptance remains open | deal inbox/messages/read, voice upload/signed playback, confirmations, complete-if-ready, completion notifications |
| Direct and contextual messaging | Implemented locally; device acceptance remains open | direct compose/inbox/requests/read/text/voice, contextual inbox/thread/read/text/voice/notification dispatch |
| Stories | Implemented locally; device acceptance remains open | home groups, signed image/video viewer, view/like, contextual text/voice reply, gallery/camera create, streaming publish/cleanup, counts, owner viewers, delete |
| Offer inbox and receiver decisions | Implemented locally; notification/device acceptance remains open | offer lists, thinking, soft reject, accept |
| Offer creation from item detail | Implemented locally; notification/device acceptance remains open | item validation, block state, owned items, create offer |
| Own/public profiles and listing lifecycle | Implemented locally; trust detail/device acceptance remains open | own/public profile, avatar/cover media, owner active listings, follow/block state and actions, listing lifecycle |
| Settings and account controls | Implemented locally; push permission/device acceptance remains open | profile privacy, notification preferences, blocked users/unblock, account deletion |
| In-app notifications and native push | Implemented locally; server credential/deployment and device/background acceptance remain open | list, read, read-all, device register/disable, FCM data delivery, native tap routes, domain dispatch |
| Authenticated app shell | Implemented foundation | No direct endpoint |

## Add Item contract and native implementation

The legacy screen establishes useful behavior, not a layout to copy. The native screen's primary job is to help a user publish a trustworthy swap listing with the least uncertainty. The implemented native flow uses three focused stages: identity and images, honest condition and useful detail, then swap intent and optional human context. It has a distinct native presentation rather than reproducing the legacy six-step layout.

The existing Oracle contract must be reused:

- `GET /v1/marketplace/categories`
- `POST /v1/media/uploads` to obtain an upload grant
- `PUT` to the granted object URL with a known content type and byte length
- `POST /v1/media/uploads/complete` to verify the object and obtain its public URL
- `DELETE /v1/media/objects` for compensating cleanup
- `POST /v1/marketplace/items` with the existing exact publish payload
- optional `POST /v1/marketplace/items/{itemId}/wanted-tags`
- optional `POST /v1/marketplace/items/{itemId}/video`
- failure compensation through `POST /v1/marketplace/items/{itemId}/publish-failed` and image cleanup

Publish invariants already enforced by Oracle include one to eight HTTPS images, first image as the sole primary image, stable sort order, four supported condition values, three desire modes, UUID ownership, bounded text, and owned object keys. Native validation should prevent avoidable requests but must not weaken server validation.

The Android implementation currently accepts up to four persisted gallery documents or camera captures, resolves real MIME type and byte length, streams each object with fixed `Content-Length`, reports per-image progress, and supports user cancellation. A cancellation or failed publish performs best-effort compensating object cleanup while keeping the local draft. Text, optional one-shot coordinates, and media metadata are recovered per signed-in user after process restart; gallery access uses persistable URI grants. Manually changing city or area clears captured coordinates so stale GPS data cannot silently disagree with the visible place.

## Native product and visual direction

The native client is Arabic-first and RTL-first. It should use an intentional Teswa system for type hierarchy, spacing, surfaces, cards, actions, navigation, media, motion, feedback, and loading/empty/error/offline states. Material 3 is the implementation substrate, not the visual identity.

Before a major screen is built, record its user job, information priority, primary interaction, and removable complexity. Do not reproduce Expo layouts, Facebook Marketplace, Dubizzle, or generic Material samples.

## Migration checklist

- [x] Native project and Play package identity
- [x] Google Credential Manager to Oracle auth exchange
- [x] Encrypted native session persistence
- [x] Central refresh ownership and single retry after 401
- [x] Profile and policy account gates
- [x] Authenticated shell and bottom-navigation foundation
- [x] Home feed, images, pagination, and item detail
- [x] Native visual-system foundation: calm Teswa color, type, shape, light, and dark tokens
- [ ] Final navigation architecture and feature-level reusable components
- [x] Add Item: image selection/camera, streaming upload, validation, publish, retry, progress, cancellation, cleanup, and draft recovery
- [ ] Messages, offers, deals, unread state, and reconnect behavior (deal/direct/contextual text and voice upload, cleanup, signed playback, offer/request/read, notifications, and polling implemented locally; physical-device and production acceptance remain)
- [ ] Own/other profile, profile editing, avatar, and listing lifecycle (own/public profiles, social actions, text editing, streaming avatar/cover replace/remove/cleanup, and listing lifecycle implemented; detailed trust, badges, and physical-device media acceptance remain)
- [ ] Stories required by the current product (home rail, signed image/video viewer, view/like, contextual text/voice reply, gallery/camera create, streaming publish/cleanup, counts, owner viewer list, manage, and delete implemented locally; physical-device and production acceptance remain)
- [ ] In-app notifications, Android push, and tap routing (center, unread/read-all, Firebase Installation ID register/disable, dual Expo/FCM worker routing, local display, and item/deal/offer/profile/direct/contextual routes implemented; FCM service-account provisioning, deployment, and physical-device background acceptance remain)
- [ ] Nearby/location flows (optional one-shot native permission/location, 3 km Oracle nearby feed, and Add Item coordinate publishing implemented locally; physical-device acceptance remains)
- [x] Settings and account controls: messaging privacy, notification preferences, blocked users, sign-out, and confirmed deletion
- [ ] Deep links and background/lifecycle behavior (validated native/custom/HTTPS route parsing and single-top delivery implemented; verified App Links and killed-process/device acceptance remain)
- [ ] Release AAB with existing Play signing identity
- [ ] Real-device login, restore, refresh, media, and critical-flow smoke
- [ ] Production Oracle end-to-end acceptance and controlled cutover evidence

## Known blockers and acceptance boundaries

- Local unit tests and `assembleDebug` do not prove Google provider, physical-device, Play-update, sender/inbox, OCI deployment, or production acceptance.
- Public Oracle/Edge and full production cutover evidence must be checked independently; Supabase remains the production and rollback authority until an explicitly approved cutover.
- The Oracle push worker now preserves Expo delivery while routing `fcm:` devices through FCM HTTP v1 using Firebase Installation IDs. Outbound send remains rehearsal-disabled, no service-account secret is committed, and production FCM delivery is not accepted until the credential is provisioned outside the repository and a physical-device send/tap is observed.
- The visual-system foundation exists, but feature-level primitives and the final navigation presentation are still incomplete.
- Add Item image upload now streams bytes safely and exposes progress/cancellation; physical-device camera/gallery behavior and production object upload remain acceptance gates. Reading large video files wholly into memory is not an acceptable future implementation.
- Profile avatar and cover changes use the same owned Oracle media boundary, fixed-length streaming, post-save old-object cleanup, and no guessed deletion of legacy external URLs; camera/gallery and production object-storage acceptance remain open.
- `lintDebug` is green with baseline warnings that still need deliberate release work: target API review, Credential Manager mutable-context handling, application icon/data-extraction rules, KTX preferences cleanup, and dependency update review.

## Expo removal criteria

Remove or archive Expo only in a separate final cleanup PR after every required checklist item is native, the release AAB is signed with the existing Play identity, the update path is tested without uninstalling, real-device critical flows pass, production Oracle behavior is accepted, deep links/notifications/background behavior are covered, and rollback is documented. That cleanup PR may then remove Expo runtime/build dependencies, Expo Updates, obsolete Supabase mobile code, and stale documentation.
