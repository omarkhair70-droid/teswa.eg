# M48.3 Auth Entry + Runtime Hotfix

## Root cause of slow auth entry
- Auth bootstrap awaited profile check then awaited policy check before `bootstrapReady`.
- Each network path can take up to ~12s timeout; serialized execution produced ~20s+ entry delays.
- Root navigator also blocked on loading states and showed `نجهّز حسابك...` even for returning users already known-good.

## Fast-path behavior now
- Bootstrap now marks shell-ready once onboarding/session are known.
- Profile + policy checks are kicked in parallel (`Promise.all`) instead of serialized awaiting.
- Added local account-gate cache keyed by user id and policy-version fingerprint to fast-path known returning users while background revalidation runs.
- Cache is written only after successful verified complete-profile + required-policy state.
- Cache is cleared on sign-out/session loss.
- If revalidation later finds missing profile/policy, routing still forces profile setup/policy acceptance.

## What still blocks and why
- Unknown/new users without safe cache still see truthful checking state until first verification completes.
- Hard verification errors still show retry UI (we do not bypass policy/profile enforcement).

## Manual validation checklist
1. Cold launch while signed in (known completed account): app shell opens quickly; no long blocking splash.
2. Login after explicit logout: if no cache, checking appears briefly; then routes correctly.
3. Sign out then sign in with incomplete profile user: routed to `/profile-setup`.
4. Sign in with missing required policy acceptance: routed to `/policy-acceptance`.
5. Simulate delayed network: ensure no serialized 12s+12s wait; checks run concurrently.
6. If follow RPC fails in dev, inspect console for structured code/message/details diagnostics.
