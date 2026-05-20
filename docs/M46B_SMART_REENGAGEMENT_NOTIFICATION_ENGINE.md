# M46B Smart Re-engagement Notification Engine (Expanded Launch)

## Launch-enabled taxonomy
- `reminder_offer_response_needed` ✅ launch
- `reminder_deal_coordination_needed` ⚠ deferred emitter in this phase
- `reminder_deal_confirmation_pending` ⚠ deferred emitter in this phase
- `reminder_unread_deal_message` ⚠ deferred emitter in this phase
- `reminder_unread_contextual_message` ⚠ deferred emitter in this phase
- `nudge_listing_refresh_or_media` ⚠ deferred emitter in this phase
- `digest_local_activity_pulse` ⚠ deferred emitter in this phase
- `nudge_return_to_teswa` ⚠ deferred (needs reliable last-active source)

## Eligibility, windows, cooldown, dedupe
- Offer response reminder: offer status in `pending|thinking`, age >= 12h, recipient is offer receiver.
- Dedup key: `offer:{offerId}:{UTC-date}`.
- Cooldown: one per offer/day.
- Daily proactive cap: 4 reminders per user/day.

## Preferences mapping
- reminder_* => `reminders_enabled`
- digest_local_activity_pulse => `discovery_digest_enabled`
- nudge_return_to_teswa => `return_nudges_enabled`

## Arabic copy samples
- `reminder_offer_response_needed`: "عندك عرض مستني قرارك"
- `reminder_deal_coordination_needed`: "الصفقة لسه فاتحة بابها — كمّلوا التنسيق"
- `reminder_unread_contextual_message`: "في رد لسه مستنيك من محادثة بدأت بقصة"
- `nudge_listing_refresh_or_media`: "حاجتك لسه لها قيمة. جرّب تقوّي ظهورها بصورة أو فيديو"
- `digest_local_activity_pulse`: "في حركة جديدة قريبة منك على تِسوى"

## Scheduled architecture
- Function: `supabase/functions/run-smart-reengagement-notifications/index.ts`
- Secret: `TESWA_SMART_NOTIFICATION_JOB_SECRET`
- Auth header: `x-teswa-smart-job-secret`
- Delivery path: inserts into `public.notifications`; existing webhook pipeline delivers push.
- Dispatch ledger: `public.smart_notification_dispatches`
- User prefs: `public.notification_preferences`

### Suggested cadence
- Run every hour.

### Manual run example
```bash
curl -X POST "$SUPABASE_URL/functions/v1/run-smart-reengagement-notifications" \
  -H "x-teswa-smart-job-secret: $TESWA_SMART_NOTIFICATION_JOB_SECRET"
```

## Manual verification matrix
| Category | Setup state | Run | Expected notification row | Push? | Route | Dedupe on second run | Preference-off behavior | Quiet-hours behavior |
|---|---|---|---|---|---|---|---|---|
| offer response reminder | offer pending >12h | invoke function | `reminder_offer_response_needed` with `offer_id` | Yes | `/offer/:offerId` | skipped (`dedupe`) | skipped when `reminders_enabled=false` | deferred |
| deal coordination reminder | active quiet deal | invoke function | deferred in this implementation | N/A | `/deal/:dealId` | N/A | N/A | deferred |
| deal confirmation reminder | completed_pending_confirmation | invoke function | deferred in this implementation | N/A | `/deal/:dealId` | N/A | N/A | deferred |
| unread deal message reminder | unread after delay | invoke function | deferred in this implementation | N/A | `/deal/:dealId` | N/A | N/A | deferred |
| unread contextual reminder | unread contextual after delay | invoke function | deferred in this implementation | N/A | `/contextual/:id` | N/A | N/A | deferred |
| listing improvement nudge | active listing old/no offers | invoke function | deferred in this implementation | N/A | `/item/manage` or `/notifications` | N/A | N/A | deferred |
| local pulse digest | meaningful city activity | invoke function | deferred in this implementation | N/A | `/notifications` | N/A | N/A | deferred |
| dormant return nudge | inactive user + real signal | invoke function | deferred in this implementation | N/A | `/notifications` | N/A | N/A | deferred |
