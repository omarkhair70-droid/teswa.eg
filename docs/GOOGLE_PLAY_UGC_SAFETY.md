# GOOGLE_PLAY_UGC_SAFETY (M44B1)

## What this phase implements
- Core in-app reporting across users, items, stories, and existing deal reporting.
- Core user blocking with Supabase-backed `user_blocks` table and RLS.
- Blocking-aware enforcement for creating offers, starting/sending story replies, and sending deal chat messages.

## Reportable UGC surfaces
- User profiles (`/report/user/[userId]`)
- Marketplace items (`/report/item/[itemId]`)
- Stories (`/report/story/[storyId]`)
- Deal flow (existing: `/report/deal/[dealId]`)

## Where blocking is available
- Public profile surface (`/profile/[id]`)
- Story viewer (`/story/[userId]`)
- Deal chat (`/deal/[id]`)

## Current blocking enforcement
- Prevents creating new swap offers when either side blocked the other.
- Prevents story replies (text/voice flow guard) when either side blocked the other.
- Prevents creating/sending new direct interaction messages in blocked deal relationships.
- Contextual story-reply RPC includes DB-side block checks for conversation/message creation.

## Deferred for later phases
- Terms/Community Guidelines acceptance gate.
- Public policy pages.
- Admin moderation operations/dashboard.
