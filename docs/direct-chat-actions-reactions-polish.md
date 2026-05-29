# Direct Chat message actions and reactions polish

## What changed

Direct Chat message actions were lightly polished without changing Stream behavior.

The message action sheet keeps the existing custom Teswa UI while making action labels clearer:

- copy text
- reply to message
- add heart reaction
- add thumbs-up reaction
- save to Dolab
- report message
- delete my message

## Safety rules

The action sheet keeps existing safeguards:

- users cannot report their own message
- users can only delete their own message
- Stream reaction/send/delete behavior is unchanged
- report handling is unchanged
- Dolab save handling is unchanged

## Scope

This change does not alter:

- Stream connection logic
- Direct Chat cache
- video thumbnail generation
- image viewer behavior
- message sending or uploads
- Supabase migrations
- Settings or Sentry
- package dependencies

## Future work

A richer reaction picker can be added later after manual QA of the current Stream reaction behavior.

Potential future additions:

- reaction toggle/remove
- more emoji choices
- long-press reaction row
- grouped reaction chips with own reaction highlighting
- better native/context-menu treatment
