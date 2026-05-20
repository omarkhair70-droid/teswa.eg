# M46B Smart Re-engagement Notification Engine (Launch Scope Implemented)

## Implemented launch-enabled categories
1. `reminder_offer_response_needed`
   - Signal: `offers.status in ('pending','thinking')` and `created_at <= now - 12h`.
   - Recipient: `offers.receiver_id`.
   - Route: `/offer/:offerId`.
   - Dedupe key: `offer_response:{offerId}:{UTC-day}`.

2. `reminder_deal_coordination_needed`
   - Signal: `swap_deals.status='coordinating'`, deal age >=24h, and latest activity (`max(deal_messages.created_at, swap_deals.created_at)`) older than 24h.
   - Recipient: both participants (`requester_id`, `offerer_id`) with per-user dedupe.
   - Route: `/deal/:dealId`.
   - Dedupe key: `deal_coordination:{dealId}:{userId}:{UTC-day}`.

3. `reminder_deal_confirmation_pending`
   - Signal: `swap_deals.status='completed_pending_confirmation'` and user missing from `deal_confirmations`.
   - Recipient: only unconfirmed participant(s).
   - Route: `/deal/:dealId`.
   - Dedupe key: `deal_confirmation:{dealId}:{userId}:{UTC-day}`.

4. `reminder_unread_deal_message`
   - Signal: true deal thread unread state using `deal_messages` + `deal_message_reads` (recipient `last_read_at` is null or older than latest incoming message), and latest incoming message age >=6h.
   - Recipient: deal participant with unread incoming latest message.
   - Route: `/deal/:dealId`.
   - Dedupe key: `unread_deal:{dealId}:{userId}:{UTC-day}`.

5. `reminder_unread_contextual_message`
   - Signal: true contextual thread unread state using `contextual_messages` + `contextual_message_reads` (recipient `last_read_at` is null or older than latest incoming message), and latest incoming message age >=6h.
   - Recipient: deal participant with unread incoming latest message.
   - Route: `/contextual/:conversationId`.
   - Dedupe key: `unread_contextual:{conversationId}:{userId}:{UTC-day}`.

6. `nudge_listing_refresh_or_media`
   - Conservative launch-safe signal: `items.status='active'`, item age >=7 days, and zero offers (`offers.requested_item_id=item.id`).
   - Recipient: item owner.
   - Route: `/item/:itemId` (notification includes `item_id`, and route resolution maps item notifications to item detail).
   - Dedupe key: `listing_refresh:{itemId}:{UTC-day}`.

## Deferred categories (exact reasons)
1. `digest_local_activity_pulse` deferred.
   - Missing reliable “minimum meaningful local movement threshold” contract across city/area for both items and stories in one stable server-side query path.
   - Unlock: add a production SQL view/RPC returning per-user local activity aggregates with anti-noise thresholds.

2. `nudge_return_to_teswa` deferred.
   - Missing authoritative last-active signal per user (no dedicated `last_seen_at`/presence timestamp suitable for scheduler decisions).
   - Unlock: add server-side last-active field updated by authenticated sessions/app foreground heartbeat.

## Preferences mapping
- `reminder_*` and `nudge_listing_refresh_or_media` -> `reminders_enabled`.
- `digest_local_activity_pulse` -> `discovery_digest_enabled` (deferred).
- `nudge_return_to_teswa` -> `return_nudges_enabled` (deferred).


## Preferences UI scope (this PR)
- Backend preferences foundation is implemented (`notification_preferences` table + helper RPC + typed client helper).
- Scheduler respects stored preference rows (category toggles + quiet hours).
- User-facing settings UI for editing reminders/digest/return nudges/quiet-hours is **not** included in this PR and should be delivered in a focused follow-up UI phase before/at launch if required.

## Quiet-hours behavior
- Preference fields used: `quiet_hours_start`, `quiet_hours_end`, `timezone`.
- Engine computes current local minute-of-day using user timezone via `Intl.DateTimeFormat`.
- If timezone is invalid/missing, fallback is UTC to keep behavior deterministic and safe.
- If local time is inside quiet-hours interval, proactive notification is skipped and counted as `skipped.quietHours`.

## Anti-spam and dedupe controls
- Per-user daily cap: 4 sent proactive notifications/day.
- Atomic dedupe reservation: insert dispatch ledger row first with unique `dedupe_key` and `status='reserved'`.
  - Conflict (`23505`) => dedupe skip.
  - Reservation success => attempt notification insert.
  - Notification insert failure => mark dispatch `status='failed'` + `failure_reason`.
  - Success => finalize dispatch `status='sent'` + `notification_id`.
- This prevents duplicate user-facing notifications from concurrent scheduler runs for the same dedupe key.

## Operational response payload
Function returns:
- `sentByType`
- `skipped.dedupe`
- `skipped.cap`
- `skipped.preferences`
- `skipped.quietHours`
- `failures` keyed by category/reason
- `deferred` categories list

## Deployment and schedule
- Edge Function: `supabase/functions/run-smart-reengagement-notifications/index.ts`
- Secret: `TESWA_SMART_NOTIFICATION_JOB_SECRET`
- Header: `x-teswa-smart-job-secret`
- Suggested cadence: hourly

### Manual invoke
```bash
curl -X POST "$SUPABASE_URL/functions/v1/run-smart-reengagement-notifications" \
  -H "x-teswa-smart-job-secret: $TESWA_SMART_NOTIFICATION_JOB_SECRET"
```

## Manual verification matrix
| Category | Setup state | Expected row | Push | Route | 2nd run | Pref-off | Quiet-hours |
|---|---|---|---|---|---|---|---|
| offer response | pending/thinking offer >12h | `reminder_offer_response_needed` + `offer_id` | yes | `/offer/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
| deal coordination | coordinating deal quiet >24h | `reminder_deal_coordination_needed` + `deal_id` | yes | `/deal/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
| deal confirmation | status `completed_pending_confirmation` + user unconfirmed | `reminder_deal_confirmation_pending` + `deal_id` | yes | `/deal/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
| unread deal message | latest incoming deal message older than 6h and `deal_message_reads.last_read_at` is null/older than that message | `reminder_unread_deal_message` + `deal_id` | yes | `/deal/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
| unread contextual | latest incoming contextual message older than 6h and `contextual_message_reads.last_read_at` is null/older than that message | `reminder_unread_contextual_message` + `contextual_conversation_id` | yes | `/contextual/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
| listing nudge | active item >7d with no offers | `nudge_listing_refresh_or_media` + `item_id` | yes | `/item/:id` | dedupe skip | skip when `reminders_enabled=false` | skip |
