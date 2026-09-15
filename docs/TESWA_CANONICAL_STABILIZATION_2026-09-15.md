# Teswa canonical stabilization — 2026-09-15

## Canonical line

Until the Android-native client is ready, the only branch for runtime stabilization is:

`stabilize/canonical-runtime-20260915`

Its review PR is `#516` against `chore/oracle-runtime-cutover-prep-20260910`.

Do not start new production runtime fixes from the old `integration/oracle-domain-closure-20260907` line or from the released Build 25 commit directly.

## Old integration PR #489

PR #489 remains useful as migration history and as a reconciliation source, but it is no longer a safe direct merge target. The post-cutover line has diverged substantially from it. At the reconciliation point on 2026-09-15, the old integration head had only three file-level differences not present on the post-cutover line:

- `docs/TESWA_CHAT_HANDOFF_2026-09-09.md`
- `scripts/oci-migration/edge-api-rehearsal.py`
- `scripts/oci-migration/test_edge_api_permissions.py`

The functional Edge rehearsal changes and their regression test are carried into the stabilization branch. The stale handoff document is intentionally not copied as runtime source of truth.

## Stabilization fixes already carried

- encoded policy key separators (`%2C` / `%2c`) are accepted by maintained Oracle gateway allowlists while double encoding and query injection remain rejected
- Edge API rehearsal smoke checks no longer write response bodies into a root-owned backup directory
- native Google login no longer signs the Google account out before every login attempt
- Google provider success and Teswa backend/session exchange failure are reported as separate phases
- stale `supabase_id_token_*` diagnostic step names are replaced with backend-neutral exchange step names
- a failed Teswa backend exchange does not incorrectly send the user into browser OAuth fallback after Google already succeeded

## Release gates

No Android release or OTA promotion is considered stable until all of these are proven against the same source line:

1. Edge instance is healthy and not in a transitional OCI lifecycle state.
2. Public `GET /healthz` returns 200 through the real HTTPS hostname.
3. Public unauthenticated `GET /v1/auth/session` reaches Auth and returns the expected 401 response quickly.
4. Real-device Google sign-in obtains an ID token and `/v1/auth/google` completes a Teswa session without a 12-second transport timeout.
5. Authenticated profile read succeeds.
6. Authenticated policy acceptance read succeeds with the exact URLSearchParams encoded comma form used by the Android client.
7. Account gate completes on a real device without falling back to the generic account/policies error screen.

## Expo rule while stabilizing

Do not publish a normal JS OTA onto the shared `production` channel/runtime merely to repair the internal-test build. Existing public binaries can share that runtime while having different native dependency sets. Prefer an embedded/native build or an explicitly isolated runtime/version for future test releases.

## Android-native migration

The replacement client will live in this repository under `android-native/` and keep the Google Play identity `com.teswa.mobile`. The first Play test build must use a versionCode greater than 25 so it installs as an update to the existing Teswa app rather than as a separate application.

The native client should use Kotlin + Jetpack Compose and Android Credential Manager / Sign in with Google, and should reuse the Oracle HTTP contracts rather than reimplementing backend semantics in the client.

Migration order:

1. native project/build foundation
2. auth + durable session storage + account gate
3. Home/read-only marketplace surfaces
4. item detail and media
5. add/edit item flows
6. offers/deals/messages
7. stories/notifications/background work
8. camera/audio/video/share-intent parity
9. release hardening and Internal testing update

The Expo client remains available as a behavior reference until native parity is proven; it is not the long-term runtime target.
