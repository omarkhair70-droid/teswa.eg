# Lane 4 current standing point — 2026-09-07

Repository: `omarkhair70-droid/teswa.eg`  
Branch: `migration/supabase-to-oci-20260903`

## Exact result

The private Core API now forwards the supported Auth routes to the existing
loopback Auth service. Deployment **SUCCEEDED**, exit **0**, at
`2026-09-07T05:17:51.277000+00:00`; guest execution took 35.32 seconds.
Supabase remains production authority. No production cutover, source mutation,
database mutation, source deletion, DNS change, or firewall change occurred.

This continuation fast-forwarded to `fd4a833` before new work. Reuse the existing
identity, storage, database/RLS, realtime and worker evidence; do not restart the
original `f45de353` handoff or replay completed migrations. The September 6
post-push/RPC documents predate subsequent runtime commits and are not a current
list of unimplemented database functions.

## New work and verification

- `20b7c41`: bounded, allowlisted private API-to-Auth gateway, guarded deployment,
  rollback, durable submission receipt and nine HTTP route tests.
- `56c0256`: supported OCI `--no-overwrite` upload guard and useful CLI errors.
- This checkpoint adds a bounded guest readiness curl and makes pending status
  exit with code 3 rather than reporting command success. These operator changes
  do not change the already-deployed gateway Python source.
- Nine HTTP tests passed locally and independently on Cloud Shell/Linux. One
  intermediate Windows run had socket timeouts; the diagnostic rerun passed,
  as did Linux and the actual guest route verification. No cause was established
  for that intermediate Windows failure.
- Guest checks passed: API health, forwarded Auth health with durable sessions,
  unauthenticated session 401, invalid Google token 401, unconfigured signup 503,
  unknown route 404, and active service after deployment.

Core hostname is `core01`; OCI display name is `teswa-core-01`.
API remains `10.20.10.176:3100`, Auth remains `127.0.0.1:3110`.
The existing rootless-capability/read-only Podman service configuration was
preserved apart from its Python entrypoint. Concurrency and body sizes are bounded;
only the Authorization header is forwarded. Signup and resend deliberately return
503 because the current Auth implementation cannot deliver confirmation tokens.

Edge inspection succeeded: hostname `edge01`, Caddy site
`http://10.20.0.218:8080`, `auto_https off`, only health routes to Core API and
realtime. There is no Auth route on the edge. Private rehearsal success is not
production authentication or app acceptance.

## Durable evidence and recovery

Cloud Shell deployment directory:
`~/teswa-migration-evidence/auth-gateway-20260907T051412Z/`

It contains `receipt.json`, `command.json`, `execution.json`, content/target JSON,
and the artifact. The private versioned artifact is retained under the existing
`teswa-backups/lane4-rehearsal/auth-gateway/` permission scope. Do not resubmit a
deployment to recover its output; read the stored command execution.

Guest evidence: `/var/tmp/teswa-auth-gateway.vP8CyrJv`  
Previous service backup: `/var/lib/teswa-auth-gateway-backup.39xEfWOq`

Discovery evidence is under
`~/teswa-migration-evidence/continuation-20260907/`: successful API/edge discovery,
DNS/email inventory, and an additional read-only gateway observation. That extra
observation was last `ACCEPTED`/`VISIBLE` at `05:18:48.506 UTC`; it is not a pending
mutation and is not needed to establish the successful deployment above.

```bash
git -C "$HOME/teswa.eg" pull --ff-only origin migration/supabase-to-oci-20260903
python3 "$HOME/teswa.eg/scripts/oci-migration/deploy-auth-api-shadow.py" \
  --status "$HOME/teswa-migration-evidence/auth-gateway-20260907T051412Z"
```

## Remaining production gates / external inputs

OCI access works; no new OCI access grant is currently needed. Run Command can
remain ACCEPTED for several minutes before completing; that alone is not failure.

Both the Teswa compartment and tenancy root have zero configured OCI public DNS
zones, email domains and approved email senders in Jeddah. No SMTP, Resend,
Mailgun, Postmark, SendGrid or Cloudflare credential environment names were found
in Cloud Shell. This does not establish absence at an external DNS/mail provider.
The production domain and access to its DNS/provider must be identified before
configuring authenticated public HTTPS and verified transactional email delivery.

Further engineering remains: integrate the completed Lane 2 boundary (still on
`refactor/backend-boundary-20260903`), implement/select OCI app adapters and domain
HTTP/media transports, finish confirmation delivery and new-user/Google flows,
verify actual Google/password sessions and device persistence, verify replacement
account lifecycle and production jobs, then perform fresh source/delta capture,
write coordination, parity and rollback checks before controlled traffic cutover.
Existing rehearsal snapshots are not a current production delta or freeze.

No claim of full production closure is made. User requested immediate preservation
and push before the usage limit. All migration work is committed; unrelated IDE,
EAS, app.config.js and tsconfig.json user work remains untouched. Supabase deletion
or irreversible retirement still requires explicit user approval.
