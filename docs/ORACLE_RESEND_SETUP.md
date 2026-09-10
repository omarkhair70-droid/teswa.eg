# Oracle rehearsal: Resend confirmation delivery

The Auth runtime accepts an explicit Resend provider without changing the
existing OCI provider configuration. No provider fallback occurs. This patch
does **not** implement password recovery or prove delivery to a real mailbox.

Store a send-only key for the approved sender in an absolute server-side file,
owned by root, group `teswaauth`, mode `0640`. Never put it in Git, app variables,
command arguments, issue comments, or screenshots. Configure `--email-config`
with a root-owned, service-readable JSON file:

```json
{
  "email_delivery": {
    "provider": "resend",
    "sender": "REPLACE_WITH_VERIFIED_SENDER",
    "public_base_url": "https://130-110-122-142.sslip.io",
    "api_key_file": "/etc/teswa/resend-api.key"
  }
}
```

Deployment gate: obtain the existing verified sender and secret path, back up
the live Auth server/config/unit, validate the new config as `teswaauth`, and
apply only the Auth server change. Do not run the original bootstrap deployer:
it imports legacy credentials, reapplies SQL, and is not an incremental update.
Keep the existing session key, identity map, DB, gateway, and listeners intact.

Acceptance: dedicated test account signup -> provider submission receipt ->
actual inbox link -> one-time confirmation -> password login -> session refresh
and logout. Signup returns `confirmation_delivery: submitted` only after the
provider returns a message ID. That means provider acceptance, not inbox
delivery. Resend-confirmation returns the same `202 {accepted:true}` for unknown,
already-confirmed, and pending accounts; it must not claim mail was sent when
there was no confirmation token. Provider rejection/transport errors return
503 with no raw provider response, recipient, credential, or token in logs.

The fixed TLS endpoint and payload follow the
[Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).
No production cutover, DNS change, or Supabase retirement is part of this change.
