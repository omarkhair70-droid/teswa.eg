# Teswa Phase 00 — Legacy Kill Map

**Date:** 2026-09-17  
**Branch:** `audit/native-product-reality-20260917`  
**Status:** AUDIT BASELINE — NO DELETION AUTHORIZED YET

## Purpose

Teswa now has a Play-tested native Android v26 proof under `android-native/`. Phase 00 exists to separate the product and operational truth worth carrying forward from the Expo / React Native / Supabase-era implementation that should eventually disappear.

This document is deliberately a **classification map**, not a deletion script.

No legacy path is deleted merely because a native replacement exists. Deletion only happens after its remaining roles are checked: product evidence, migration/rollback, operational tooling, assets, legal/store requirements, or still-live backend/admin dependencies.

## Baseline evidence

The repository currently contains two mobile worlds side by side.

### Legacy mobile root

The root `package.json` still identifies `expo-router/entry` as the application entry point and carries Expo, React Native, Expo Router, EAS build/submit scripts, and `@supabase/supabase-js`.

Legacy application/config surfaces include at least:

- `app/`
- `components/`
- `providers/`
- `hooks/`
- `integrations/`
- `lib/`
- `assets/`
- `.expo/`
- `app.config.js`
- `eas.json`
- `babel.config.js`
- `metro.config.js`
- `expo-env.d.ts`
- `plugins/`
- root `package.json` / `package-lock.json`
- Expo/EAS workflows under `.github/workflows/`
- `supabase/`

`app.config.js` still defines Expo Updates, Expo plugins, Expo notification/location/camera/audio behavior and EAS project identity for `com.teswa.mobile` / preview.

`eas.json` still defines development/preview/production EAS builds and production submission.

### Native authority

`android-native/app/build.gradle.kts` defines the current native Android package directly:

- `applicationId = "com.teswa.mobile"`
- `versionCode = 26`
- `versionName = "1.0.11"`
- Kotlin / Jetpack Compose
- Java 17
- direct Firebase Messaging / Installations
- explicit release signing gate
- explicit HTTPS release API gate

The native source tree is organized around `account`, `auth`, `core`, `home`, `shell`, `ui`, and product feature packages. It is not a React Native shell around old screens.

## Classification vocabulary

### PRESERVE — AUTHORITY
Current product/runtime truth. Do not remove as part of legacy cleanup.

### KEEP — SHARED / OPERATIONAL
Not legacy simply because it lives outside `android-native`. Keep unless a narrower audit proves replacement or obsolescence.

### MIGRATE — EXTRACT VALUE THEN REMOVE
Contains assets, copy, behavior, data-shape knowledge, or product evidence that may still matter. Extract the truth into the new system first; the implementation itself is not the future.

### TEMPORARY — ROLLBACK / MIGRATION WINDOW
Intentionally retained until native + Oracle closure makes rollback or migration support unnecessary.

### DELETE LATER — LEGACY IMPLEMENTATION
Target for removal after its dependencies and rollback role reach zero.

### INVESTIGATE
Ownership or runtime role is not yet proven strongly enough for deletion.

---

# A. PRESERVE — NATIVE AUTHORITY

## `android-native/`

**Classification:** PRESERVE

Reason:
- current native Android runtime
- Play-tested v26 update path
- package/signing identity
- Oracle-facing repositories and transport
- native device integrations
- current product behavior reference for what has already been migrated functionally

Important rule:

> Preserve the behavioral capability; do not preserve the current Compose visual shell as a design baseline.

The current UI proved plumbing and end-to-end behavior. It is allowed to be rebuilt heavily.

## Native release/signing gates

**Classification:** PRESERVE

Keep the release checks that prevent accidental unsigned or rehearsal-targeted distributable builds.

## Current Oracle contracts / runtime integration

**Classification:** PRESERVE

The native product must continue treating Oracle/Teswa backend contracts as durable business truth. UI redesign must not reintroduce Supabase mobile runtime coupling.

---

# B. KEEP — SHARED / OPERATIONAL UNTIL PROVEN OTHERWISE

## `api/`

**Classification:** KEEP / INVESTIGATE BY SUBTREE

Do not call this legacy by association. Phase 00 must distinguish current Oracle/API runtime code from historical migration or compatibility code.

## `admin/`

**Classification:** KEEP / INVESTIGATE

Admin capability is a separate operational surface. Native mobile cleanup is not permission to delete admin tooling.

## `docs/`

**Classification:** KEEP, THEN CURATE

Docs contain both current authority and history. Historical files may later move to an archive, but they are evidence during Phase 00.

## `scripts/`

**Classification:** INVESTIGATE BY SCRIPT

Expected mixed ownership:
- current Oracle/runtime operations → KEEP
- migration/rehearsal/rollback tools → TEMPORARY
- Expo-only build/release helpers → DELETE LATER
- one-off dead scripts → DELETE LATER after evidence

## backend-boundary / Oracle validation workflows

**Classification:** KEEP where still authoritative

Do not delete CI that protects the backend boundary merely because old mobile CI also exists in the workflow folder.

---

# C. MIGRATE — EXTRACT TRUTH, THEN REMOVE LEGACY IMPLEMENTATION

## `assets/`

**Classification:** MIGRATE

Do not delete wholesale.

First classify every meaningful asset into:
- real product/user-facing asset still valid
- current Teswa branding candidate
- store/legal/notification asset
- obsolete old UI decoration
- duplicate/low-quality asset

Only assets that earn a role in the new product move into an intentional native asset structure. Old decorative/UI assets do not become design constraints.

## legacy copy and product behavior in `app/`

**Classification:** MIGRATE AS EVIDENCE / DELETE IMPLEMENTATION LATER

The old route tree contains real product history such as auth, item, deal, offer/contextual/direct conversation, Dolab, profile and other journeys. These are evidence of behaviors and edge cases, **not layouts to copy**.

Rule:

> Read old screens for product truth, state transitions, error cases and copy that users may depend on. Never copy them because “that is how Teswa looks.”

## `components/`, `providers/`, `hooks/`, `integrations/`, legacy `lib/`

**Classification:** MIGRATE SELECTIVELY

Potential value:
- business semantics
- edge-case handling
- formatting/copy
- media behavior
- analytics/event names
- legacy API compatibility knowledge

The React Native component architecture itself is not a target architecture.

---

# D. TEMPORARY — ROLLBACK / MIGRATION WINDOW

## `supabase/`

**Classification:** TEMPORARY + INVESTIGATE, NOT MOBILE AUTHORITY

The native app must not regain a Supabase runtime dependency. However, `supabase/` can contain historical schema/migrations/functions or migration evidence needed to understand current Oracle data lineage and rollback.

Do not delete until:
- Oracle production authority is fully accepted
- migration/rollback evidence is archived
- no still-used server/admin path depends on these files

After that, surviving historical material should be archived intentionally rather than left looking like an active mobile backend.

## legacy Expo push compatibility

**Classification:** TEMPORARY

Legacy Expo device registrations / delivery compatibility can remain during the rollback window. Native FCM becomes the forward path. Remove legacy delivery only after actual native registration and delivery acceptance and after the rollback window is closed.

## migration / rehearsal infrastructure

**Classification:** TEMPORARY

Keep until production cutover evidence and rollback evidence are formally closed. Do not confuse “not future architecture” with “safe to delete today.”

---

# E. DELETE LATER — EXPO / REACT NATIVE MOBILE IMPLEMENTATION

The following are **deletion targets**, but only after the extraction and rollback gates in this document pass:

## Expo application runtime

- `.expo/`
- legacy `app/` Expo Router implementation
- Expo-only mobile `components/`
- Expo-only `providers/`
- Expo-only `hooks/`
- Expo-only integrations and mobile helpers

## Expo build/config surface

- `app.config.js`
- `eas.json`
- `babel.config.js` if no remaining non-legacy consumer
- `metro.config.js` if no remaining non-legacy consumer
- `expo-env.d.ts`
- Expo config plugins that exist only for the old app
- Expo-only root scripts/dependencies

## Root JS mobile dependency graph

The current root package graph is overwhelmingly the old Expo/React Native app. It should eventually stop presenting itself as the primary Teswa mobile runtime.

Final form is not decided in Phase 00. Options include:
- remove the old mobile package completely
- retain a small independent web/admin package if it has a real owner
- split remaining JS tooling into explicit workspaces/packages

Do not make that structural decision until the ownership audit is complete.

## Expo/EAS mobile workflows

Observed examples include:
- `android-preview-local-eas.yml`
- `android-production-eas-build.yml`
- old mobile/SDK modernization checkpoints

**Classification:** DELETE LATER or ARCHIVE after confirming they are not part of rollback policy.

Native workflows such as `android-native-foundation.yml` are not included in this deletion class.

---

# F. CURRENT CONTRADICTIONS TO RESOLVE

## 1. Two mobile authorities appear at repository root

The root package says “Expo app”; `android-native/` is the actual forward Android product.

This ambiguity should not survive final cleanup.

## 2. Two release mental models exist

Legacy files still describe EAS build/submit while v26 was built natively and uploaded through the Google Play Android Publisher path.

Final cleanup should leave one obvious forward release route and clearly marked archival/rollback material.

## 3. Old visual implementation can accidentally become a reference library

This is explicitly forbidden.

Legacy UI can supply facts and edge cases. It cannot silently define:
- navigation hierarchy
- card shape
- colors
- typography
- motion
- information density
- Home composition

## 4. Backend history can look like active architecture

Supabase history must be separated from current Oracle authority so future work does not accidentally reintroduce old coupling.

---

# G. SAFE ERASURE ORDER — LATER, NOT NOW

1. Freeze a known-working Native/Oracle checkpoint.
2. Extract behavioral/product truth from legacy routes.
3. Extract only assets/copy that still earn a role.
4. Classify scripts/workflows by current owner.
5. Close native push + Oracle production acceptance and rollback evidence.
6. Remove dead Expo-only CI/release paths.
7. Remove dead Expo runtime/config/dependencies.
8. Remove old mobile screen/component tree.
9. Archive or remove Supabase migration history only after backend closure.
10. Run repository-wide dependency/reference audit.
11. Build/test/install native again from the cleaned repository.
12. Confirm Play update path still works before cleanup is declared closed.

# Phase 00 exit condition for this map

This map becomes executable only after every target path has:
- an owner,
- a reason,
- dependency evidence,
- a rollback decision,
- and where needed, a destination for extracted truth.

Until then: **audit hard, delete nothing blindly.**
