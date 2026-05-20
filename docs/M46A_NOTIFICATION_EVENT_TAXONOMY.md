# M46A Notification Event Taxonomy (Launch)

## Current-state audit inventory (before M46A changes)

### Types defined in `lib/notifications.ts`
- `offer_received`
- `offer_thinking`
- `offer_accepted`
- `offer_soft_rejected`
- `offer_redirected`
- `deal_created`
- `deal_completed`
- `deal_cancelled`
- `report_update`
- `system`

### Types emitted from mobile code / SQL
- `offer_received` (`lib/offers.ts`)
- `offer_thinking` (`lib/offers.ts`)
- `offer_soft_rejected` (`lib/offers.ts`)
- `offer_accepted` (`lib/offers.ts`)
- `deal_created` (`lib/offers.ts`)
- `deal_completed` (`lib/deals.ts`)
- `system` for deal text message (`lib/deals.ts`)
- `system` for deal voice message (`lib/deals.ts`)
- `system` for deal completion follow-up confirmation prompt (`lib/deals.ts`)
- `system` for story reply and contextual thread replies (`create_contextual_message_notification`)

### Push-allowlisted types before M46A
- `offer_received`
- `offer_accepted`
- `deal_completed`
- `system`

### Notification destination routing currently supported
- `/contextual/:id` (from `contextualConversationId`)
- `/deal/:id` (from `dealId`)
- `/offer/:id` (from `offerId`)
- `/item/:id` (from `itemId`)
- Explicit route payload if it is `/notifications` or prefixed by `/deal/`, `/offer/`, `/item/`, `/contextual/`

### Semantic product events hidden under `system` before M46A
- Deal text message received
- Deal voice message received
- Deal waiting-for-your-confirmation prompt
- Story reply initial message received
- Story/contextual thread follow-up message received

---

## Launch taxonomy (canonical)

| Event key / notification type | User-facing meaning | Triggering action | Recipient | Stored in notifications table? | Push delivered? | Destination route | Why push / why not push | Current implementation status |
|---|---|---|---|---|---|---|---|---|
| `offer_received` | New incoming swap offer | Sender submits offer on recipient item | Item owner (offer receiver) | Yes | Yes | `/offer/:offerId` | Core marketplace conversion moment | Implemented |
| `offer_thinking` | Recipient marked offer as thinking | Receiver taps “thinking” | Offer sender | Yes | **No** | `/offer/:offerId` | Status update is useful but non-urgent; avoid spam | Implemented (in-app only) |
| `offer_accepted` | Offer accepted | Receiver accepts offer | Offer sender | Yes | Yes | `/deal/:dealId` | High-intent event, immediate next-step required | Implemented |
| `deal_created` | Deal room opened | Offer acceptance creates deal | Both participants | Yes | **No** | `/deal/:dealId` | Redundant with `offer_accepted`; keep in-app timeline signal | Implemented (in-app only) |
| `offer_soft_rejected` | Offer politely declined | Receiver soft-rejects offer | Offer sender | Yes | Yes | `/offer/:offerId` | Important resolution signal, closes loop | Implemented |
| `offer_redirected` | Alternative route suggested | Redirect flow (when emitted) | Original offer sender | Yes | **No** | `/offer/:offerId` | Lower urgency; reduce push noise | Deferred emitter (taxonomy-ready) |
| `deal_message_received` | New text in deal chat | Counterparty sends text deal message | Other deal participant | Yes | Yes | `/deal/:dealId` | Deal continuity depends on fast response | Implemented in M46A |
| `deal_voice_message_received` | New voice message in deal chat | Counterparty sends voice deal message | Other deal participant | Yes | Yes | `/deal/:dealId` | Same coordination urgency as text | Implemented in M46A |
| `deal_completion_confirmation_needed` | Other party confirmed completion; your confirmation needed | One side confirms completion, deal not fully complete yet | Other deal participant | Yes | Yes | `/deal/:dealId` | Action-required step to finalize deal | Implemented in M46A |
| `deal_completed` | Deal fully completed | Both participants confirmed completion | Both participants | Yes | Yes | `/deal/:dealId` | Milestone completion + post-deal actions | Implemented |
| `deal_cancelled` | Deal cancelled | Cancellation flow (when emitted) | Relevant participant(s) | Yes | Yes | `/deal/:dealId` | Critical state change requiring awareness | Taxonomy-ready (emitter currently absent) |
| `story_reply_received` | First reply received on story; thread opened | Initial story reply created | Story owner | Yes | Yes | `/contextual/:contextualConversationId` | Strong social re-engagement trigger | Implemented in M46A |
| `contextual_message_received` | New follow-up message in story thread | Thread message sent in contextual conversation | Other conversation participant | Yes | Yes | `/contextual/:contextualConversationId` | Sustains active social conversation | Implemented in M46A |
| `report_update` | Moderation/report status update | Safety/admin workflow changes report | Reporting user or affected user | Yes | Yes | `/notifications` fallback | Trust/safety events are important and sparse | Taxonomy-ready |
| `system` | System/admin/safety notice only | Platform operational notices | Target user | Yes | Yes | Route based on linked IDs, else `/notifications` | Reserved for non-product generic alerts | Preserved with narrower intended use |

### Deferred / no-push discipline summary
- **In-app only at launch:** `offer_thinking`, `deal_created`, `offer_redirected`.
- **Push now:** all deal chat continuity + offer conversion/closure + story/contextual engagement + safety/admin updates.
- **Deferred emitters but taxonomy-defined:** `offer_redirected`, `deal_cancelled`, `report_update`.

---

## Operational manual test matrix

| Actor A action | Recipient B expected in-app notification | Recipient B expected push? | Tap push expected destination | Notes |
|---|---|---|---|---|
| A sends new offer on B item | `offer_received` | Yes | `/offer/:offerId` | Validate offer payload includes offer+item IDs |
| B marks offer as thinking | `offer_thinking` to A | No | N/A | Must appear in notifications list only |
| B accepts offer (deal created) | `offer_accepted` to A + `deal_created` to both | Yes for `offer_accepted`; no for `deal_created` | `/deal/:dealId` | Ensure no duplicate noisy push from `deal_created` |
| B soft-rejects offer | `offer_soft_rejected` to A | Yes | `/offer/:offerId` | Closure event should be immediate |
| A sends deal text message | `deal_message_received` to B | Yes | `/deal/:dealId` | Verify no `system` type used |
| A sends deal voice message | `deal_voice_message_received` to B | Yes | `/deal/:dealId` | Verify voice copy + route |
| A sends initial story reply to B story | `story_reply_received` to B | Yes | `/contextual/:conversationId` | Thread should open directly |
| A sends follow-up in contextual thread with B | `contextual_message_received` to B | Yes | `/contextual/:conversationId` | Confirm non-initial messages use follow-up type |
| A confirms deal completion first | `deal_completion_confirmation_needed` to B | Yes | `/deal/:dealId` | Action-required push |
| B confirms completion second | `deal_completed` to both | Yes | `/deal/:dealId` | Completion push to both participants |
