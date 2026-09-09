# Teswa Backend Decoupling — Supabase Dependency Inventory

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`  
Inventory base: `14e7198ec42f33bf0fca781c0c5c0502c628b786`

## Status

This is an architecture/dependency inventory only.

- No production cutover.
- No Supabase schema mutation.
- No DNS/data/storage migration.
- No runtime backend provider change.
- Production Supabase remains authoritative.
- The Android modernization/release lane remains untouched.

## Executive inventory

| Surface | Current direct coupling |
|---|---:|
| Client/source files importing `@/lib/supabase/client` | **65** |
| Unique RPC names called by client code | **49** |
| Unique feature-facing Auth methods | **11** |
| Supabase Auth lifecycle methods in provider shell | **2** |
| Directly queried/mutated tables/views found in client scan | **31** |
| Physical Storage buckets referenced by client code | **9** |
| Realtime subscription call sites | **4** |
| Direct Edge Function invokes from client | **1** |
| Supabase Edge Function directories in repo | **5** |
| Direct raw Supabase Storage REST upload path | **1** |

## Direct Supabase client imports — all 65 current files

### Screens/components

- `app/(auth)/login.tsx`
- `app/(auth)/profile-setup.tsx`
- `app/(auth)/signup.tsx`
- `app/(tabs)/messages.tsx`
- `app/contextual/[id].tsx`
- `app/deal/[id].tsx`
- `components/profile/ProfileConnectionsScreen.tsx`

### Lib/services

- `lib/account-deletion.ts`
- `lib/admin-reports.ts`
- `lib/admin.ts`
- `lib/analytics.ts`
- `lib/auth.tsx`
- `lib/badges.ts`
- `lib/chat/direct-runtime-auth.ts`
- `lib/chat/native-direct-channel.ts`
- `lib/chat/supabase-direct-chat.ts`
- `lib/city-pulse.ts`
- `lib/contextual-conversations.ts`
- `lib/deals.ts`
- `lib/direct-messages.ts`
- `lib/direct-privacy.ts`
- `lib/dolab/chat-bridge.ts`
- `lib/dolab/index.ts`
- `lib/dolab/media-item-link.ts`
- `lib/dolab/note-media-link.ts`
- `lib/dolab/signed-urls.ts`
- `lib/dolab/upload.ts`
- `lib/edit-listing-images.ts`
- `lib/edit-listing.ts`
- `lib/exchange-item-summaries.ts`
- `lib/google-auth.ts`
- `lib/google-native-auth.native.ts`
- `lib/google-native-auth-v2.ts`
- `lib/google-native-auth.ts`
- `lib/item-likes.ts`
- `lib/item-video-discovery.ts`
- `lib/item-video-presence.ts`
- `lib/item-videos.ts`
- `lib/listing-lifecycle.ts`
- `lib/marketplace-items.ts`
- `lib/messages.ts`
- `lib/motion-interest.ts`
- `lib/motion-video-drops.ts`
- `lib/my-listings.ts`
- `lib/notification-preferences.ts`
- `lib/notifications.ts`
- `lib/offers.ts`
- `lib/people.ts`
- `lib/personal-living-world.ts`
- `lib/policy-acceptance.ts`
- `lib/profile-images.ts`
- `lib/profiles.ts`
- `lib/publish-item.ts`
- `lib/pulse-video-viewer.ts`
- `lib/push-notifications.ts`
- `lib/reports.ts`
- `lib/reviews.ts`
- `lib/stories.ts`
- `lib/story-discovery.ts`
- `lib/story-likes.ts`
- `lib/story-views.ts`
- `lib/trust-metrics.ts`
- `lib/unread-badges.tsx`
- `lib/user-blocks.ts`
- `lib/user-follows.ts`

## RPC inventory — 49 unique names

`accept_offer`, `archive_owned_listing_if_safe`, `complete_deal_if_ready`, `create_contextual_message_notification`, `create_notification`, `create_story_reply_thread`, `delete_direct_message_v2`, `delete_owned_archived_listing_if_safe`, `disable_my_push_device`, `ensure_story_reply_conversation`, `follow_user`, `get_direct_conversation`, `get_direct_conversation_messages`, `get_direct_native_messages`, `get_my_badges`, `get_my_direct_conversations`, `get_my_notification_preferences`, `get_my_trust_metrics`, `get_nearby_marketplace_items`, `get_public_city_pulse_moving_items`, `get_public_moving_items`, `get_unread_contextual_messages_count`, `get_unread_deal_messages_count`, `get_user_badges`, `get_user_block_state`, `get_user_follow_state`, `get_user_trust_metrics`, `hide_item_for_moderation`, `is_admin_user`, `mark_contextual_thread_read`, `mark_deal_thread_read`, `mark_direct_conversation_read_v2`, `mark_offer_thinking`, `reactivate_owned_archived_listing`, `refresh_my_badges`, `register_push_device`, `review_report`, `send_direct_message`, `send_direct_native_message`, `send_direct_voice_message`, `set_direct_typing_state_v2`, `set_my_notification_timezone`, `soft_reject_offer`, `start_direct_conversation_with_message`, `start_or_get_direct_conversation`, `toggle_direct_message_reaction_v2`, `track_analytics_event`, `unfollow_user`, `update_my_notification_preferences`.

These names are provider/database implementation details. They must not appear in Teswa-owned contracts.

## Auth inventory

Feature-facing methods currently used:

- `getSession`
- `getUser`
- `onAuthStateChange`
- `signInWithPassword`
- `signUp`
- `resend`
- `signInWithIdToken`
- `signInWithOAuth`
- `exchangeCodeForSession`
- `setSession`
- `signOut`

Provider-shell lifecycle methods:

- `startAutoRefresh`
- `stopAutoRefresh`

Provider type leakage also exists:

- `lib/auth.tsx` exports context state using Supabase `Session` and `User`.
- `lib/notifications.ts` exposes `PostgrestError` in result types.
- `lib/notification-preferences.ts` exposes `PostgrestError` in result types.

This type leakage is part of the decoupling work, not just the direct client imports.

## Direct table/view inventory — 31 unique names

- `categories`
- `contextual_conversations`
- `contextual_message_reads`
- `contextual_messages`
- `deal_confirmations`
- `deal_message_reads`
- `deal_messages`
- `direct_conversations`
- `direct_messages`
- `direct_typing_state`
- `dolab_items`
- `dolab_media`
- `dolab_notes`
- `item_images`
- `item_likes`
- `item_videos`
- `item_wanted_tags`
- `items`
- `marketplace_items`
- `notifications`
- `offer_events`
- `offers`
- `profiles`
- `reports`
- `reviews`
- `stories`
- `story_likes`
- `story_views`
- `swap_deals`
- `user_blocks`
- `user_policy_acceptances`

Realtime additionally references `direct_message_attachments` and `direct_message_reactions`.

## Storage inventory — 9 physical buckets

| Bucket | Main current surfaces |
|---|---|
| `profile-images` | profile avatar/cover |
| `item-images` | listing create/edit/delete |
| `item-videos` | item teaser video |
| `story-media` | story upload/sign/delete |
| `direct-chat-media` | native direct chat attachments |
| `direct-voice-messages` | legacy/direct voice |
| `deal-voice-messages` | deal voice |
| `contextual-voice-messages` | contextual/story-reply voice |
| `dolab-media` | Dolab media |

Important exception: `lib/stories.ts` performs one upload through a raw
`${EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/story-media/...` request for upload progress. This is direct provider coupling even though it does not go through `supabase.storage`.

## Realtime inventory — 4 current subscription call sites

### Deal room — `app/deal/[id].tsx`

Channel: `deal-room:<dealId>`

- `deal_messages` — INSERT
- `swap_deals` — UPDATE
- `deal_confirmations` — INSERT

### Messages inbox — `app/(tabs)/messages.tsx`

Channel: `messages-inbox:<userId>`

- `direct_conversations` — *
- `direct_messages` — *
- `deal_messages` — *
- `contextual_messages` — *

### Contextual thread — `app/contextual/[id].tsx`

Channel: `contextual_<conversationId>`

- `contextual_messages` — INSERT, filtered by conversation id

### Native direct chat — `lib/chat/supabase-direct-chat.ts`

Channel: `direct-native:<conversationId>:<uuid>`

- `direct_conversations` — UPDATE
- `direct_messages` — *
- `direct_message_attachments` — *
- `direct_message_reactions` — *
- `direct_typing_state` — *

Realtime semantics must move behind a Teswa messaging subscription contract. Screens must not know `postgres_changes`, table names, filters, or Supabase channel status strings.

## Edge Functions / server-side Supabase inventory

Client directly invokes only:

- `delete-account`

Supabase function directories currently present:

- `delete-account`
- `run-smart-reengagement-notifications`
- `send-notification-push`
- `stream-chat-token` (retired endpoint path retained in repo)
- `stream-direct-message-webhook`

These remain server implementation details until equivalent Teswa-owned API capabilities exist.

## Boundary risk ranking

### P0

1. Auth `Session/User` provider types leak into app context.
2. Realtime is created directly from screens.
3. Messaging mixes RPC, direct tables, Storage, and Realtime in the same files.
4. Stories bypass the SDK with a raw Supabase Storage URL.
5. Notifications expose `PostgrestError` through public result types.

### P1

1. Marketplace and profile reads bind feature logic to table/view shapes.
2. Offer/deal lifecycle logic binds directly to RPC names.
3. Media code binds product concepts to physical bucket names.
4. Push/notification preferences bind UI-facing services to RPCs.

### P2

Admin, reports, analytics, trust/badges, Dolab, discovery/motion helpers and policy acceptance are lower-risk but still provider-coupled.

## Freeze rule

The current 65 direct imports are legacy debt, not a target architecture.

`scripts/check-backend-boundary.mjs` freezes the allowlist so new product code cannot add new direct Supabase client/provider/env coupling. Existing files are intentionally allowed until their domain migration is performed.
