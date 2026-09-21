# TESWA BETWEEN US — INTERNAL DEVICE HANDOFF

**Date:** 2026-09-21  
**Repository:** `omarkhair70-droid/teswa.eg`  
**Active branch:** `audit/native-product-reality-20260917`  
**Parent PR:** #526 — **Draft / Unmerged**  
**Current device candidate source:** `f7f8da10f98e3a4f7348d7923248c76eb12e59ed`

## Status

BETWEEN US implementation is code-closed for this candidate.

Do **not** add another feature slice before real-device acceptance.

Android candidate:

- package: `com.teswa.mobile`
- versionCode: **35**
- versionName: **1.0.19**
- track: **Google Play Internal Testing**
- status: **published / completed**

## Candidate validation

Previous v34 source candidate:

`d311d8914b3b0476a6cca901af1b6850c993285f`

v34 was published successfully, then real-device review found a concrete root navigation regression: tapping a waiting Offer from BETWEEN US did not open that specific relationship.

Regression fix:

- `6a3ae9b37d8928c800d50e26657a49f86ea8732d` — root Offer rows now pass the full Offer identity;
- the selected Offer id + direction are preserved into the Offer drill-down;
- the drill-down focuses the exact tapped Offer instead of only opening the generic incoming/sent lane;
- Android Native Foundation #300 — SUCCESS;
- Between Us Oracle Contracts #6 — SUCCESS.

Current v35 source candidate:

`f7f8da10f98e3a4f7348d7923248c76eb12e59ed`

Validation on that SHA:

- **Between Us Oracle Contracts #4** — SUCCESS
  - run id: `35591112779`
- **Android Native Foundation #298** — SUCCESS
  - run id: `35591112831`
  - unit tests: PASS
  - debug Kotlin compile: PASS
  - release Kotlin compile: PASS
  - release lint: PASS
  - debug APK: PASS
  - debug AAB: PASS

## Immutable Internal release

Current release branch:

`release/teswa-internal-20260921-v35`

One-shot release commit:

`ea264cd2511389411e7900b8c80856ef02f932b9`

Google Play workflow:

- name: **Teswa Native Internal v34 Once**
- run id: `35594649979`
- result: **SUCCESS**
- signed AAB artifact: `teswa-native-internal-v35-1`
- artifact id: `10636720024`
- AAB SHA-256:
  `67cb03470c7d1c7e87c43268ace4ef69237d3f3809b42accd4c87a1d5cede607`
- release API:
  `https://core01.tail6afd9b.ts.net`

Authoritative Play proof:

`PLAY_PUBLISH=PASS package=com.teswa.mobile versionCode=35 track=internal status=completed`

The v35 release branch is now an immutable release evidence branch. Do not add product changes to it.

## Release tooling correction included in v34 candidate

The candidate also fixes stale release acceptance tooling:

- `release-gate.ps1` no longer prints a hardcoded v26 identity;
- `device-smoke.ps1` no longer expects hardcoded versionCode 26;
- both helpers read versionCode/versionName from `android-native/app/build.gradle.kts`;
- the device smoke manual checklist now matches the BETWEEN US acceptance walk.

This prevents a valid future candidate from being mislabeled as non-acceptance solely because release scripts were stale.

## Exact continuation point

The next action is **real-device acceptance only**.

1. Update the existing Teswa installation from Google Play Internal Testing to **35 / 1.0.19**.
   - do not uninstall;
   - do not clear app data.
2. From the repository root, run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\android-native\scripts\device-smoke.ps1
   ```
3. Complete the first full real-device BETWEEN US walk:
   - root relationship hub;
   - incoming offer;
   - accept offer;
   - enter the same Deal relation;
   - Deal text coordination;
   - Deal voice coordination;
   - one-side completion;
   - two-side completion;
   - quiet history;
   - review as the post-completion forward action;
   - Direct request;
   - accepted Direct;
   - reply / reaction / typing / semantic delete;
   - image attachment send + receive + full-screen viewer;
   - video attachment send + receive + signed-url open;
   - file attachment send + receive + signed-url open;
   - attachment limits;
   - Dolab pull/save bridges inside Direct;
   - Contextual story reply;
   - pinned story origin;
   - story image origin full-screen;
   - story video origin signed private URL;
   - Contextual voice;
   - message-level reporting across Deal / Direct / Contextual;
   - offline/network interruption spot check;
   - session-expiry / refresh spot check.
4. Fix **only concrete regressions observed on device**.
5. If the walk is clean, record the final device-accepted closure checkpoint.
6. Keep PR #526 Draft/Unmerged until that acceptance is recorded.

## Product rejection rules remain locked

Reject any regression toward:

- a tabbed inbox;
- WhatsApp with swap icons;
- order-management rows;
- status-pill-first hierarchy;
- Deal represented mainly by latest chat preview;
- Contextual thread losing its story origin;
- Direct attachments becoming public or cross-conversation readable.

## Canonical continuation docs

- `docs/phase02/TESWA_ANCHOR_03_BETWEEN_US_V1_2026-09-17.md`
- `docs/phase02/TESWA_BETWEEN_US_PRODUCTION_CLOSURE_01_2026-09-21.md`
- `docs/phase02/TESWA_BETWEEN_US_CONTINUATION_HANDOFF_2026-09-21.md`
- **this file**

