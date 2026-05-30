# Build-needed backlog

## Rule

Keep the current app OTA-first. Do not create a new native build unless a change requires native/runtime/config updates or a grouped build batch is intentionally approved.

## Needs a native build

A future native build is required for:

- New native packages.
- Expo SDK upgrades.
- Android permission additions or removals.
- `app.config.js` plugin/config changes.
- Sentry native/plugin changes beyond JS-safe usage.
- Google/Firebase native config changes.
- runtimeVersion/appVersion changes that intentionally break OTA compatibility.
- New notification capabilities requiring native config.
- Native image viewer/pinch zoom packages.
- Native context menu packages.
- Any media package that requires native linking/config beyond the current Expo modules.

## Keep OTA-safe for now

Prefer OTA-safe work for:

- Settings copy and UI polish.
- Notification Center UI and routing behavior.
- Direct Chat UI polish.
- Stream message rendering tweaks.
- Cache behavior that only touches JS/TS.
- Form validation adoption.
- Visual system adoption.
- Home/item loading, empty, and error states.
- Analytics/telemetry additions that use existing events/tables only.

## Candidate future build batch

Only start a new native build batch when at least two or three build-needed changes are clearly worth grouping.

Possible future batch:

1. Expo SDK upgrade.
2. Native image viewer/pinch zoom.
3. Native context menu polish.
4. Any required notification native capability.
5. Any new media/recording native capability.

## Decision checklist

Before every future PR, classify it as:

- `OTA-safe`
- `Build-needed`
- `Needs review`

Ask:

1. Did package.json/package-lock change?
2. Did app.config.js change?
3. Did Android/iOS native config or permissions change?
4. Did runtimeVersion/appVersion change?
5. Did we add a native module or Expo plugin?
6. Did we add a Supabase migration?

If the answer to 1–5 is yes, do not treat it as OTA-only. If only Supabase changes are involved, review deployment order separately.
