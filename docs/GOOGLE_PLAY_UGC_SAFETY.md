# GOOGLE_PLAY_UGC_SAFETY (M44B1)

## What this phase implements
- In-app reporting for deal, user, item, and story surfaces.
- User blocking with Supabase-backed `user_blocks` and RLS.
- Secure bidirectional block-state lookup via `get_user_block_state` RPC.
- Block enforcement in offer creation, story replies (text/voice), contextual text/voice messages, and deal text/voice messages.

## Reportable UGC surfaces
- Deal chat (`/report/deal/[dealId]`)
- User profile (`/report/user/[userId]`)
- Marketplace item (`/report/item/[itemId]`)
- Story (`/report/story/[storyId]`)

## Where user blocking is available
- Public profile (`/profile/[id]`)
- Story viewer (`/story/[userId]`)
- Deal chat safety section (`/deal/[id]`)

## Current interaction blocking effect
- Prevents creating new offers if either side blocked the other.
- Prevents starting/sending story replies when blocked in either direction.
- Prevents sending new contextual text/voice messages when blocked in either direction.
- Prevents sending new deal text/voice messages when blocked in either direction.
- Historical viewing is still available; enforcement targets new interactions.

## Deferred for later phases
- Legal acceptance gate (Terms/Community Guidelines).
- Public legal/policy pages.
- Admin moderation operations/dashboard.
