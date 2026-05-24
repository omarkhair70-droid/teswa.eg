# Release OTA Playbook (Android Production)

> Purpose: standardize OTA release execution with minimal operational risk.

## 1) Sync with main
```bash
git checkout main
git pull origin main
```

## 2) Optional preflight
Recommended (especially for non-trivial releases):
- Confirm working tree is clean.
- Review latest merged PR notes.
- Run local checks:
  - `npm run typecheck`
  - `npx expo-doctor`
- Confirm manual QA checklist completion.

## 3) Run production OTA update
Use:
```bash
npx.cmd eas-cli update --branch production --platform android --environment production --clear-cache --message "..."
```

Message guidance:
- Keep message short and specific.
- Include primary scope and ticket/PR reference when available.

## 4) Post-OTA sanity checklist
Immediately after publishing OTA:
- Cold start app on Android device.
- Verify returning user startup behavior.
- Verify Google Native auth basic login/logout path.
- Verify core navigation surfaces:
  - Home hub
  - Discover + filters bottom sheet
  - Notifications tap behavior
  - Messages list + open chat
- Verify no obvious crash/blank-screen regressions.

## 5) Rollback note
If production issues are detected:
- Use EAS dashboard/update history to identify the problematic update.
- Follow EAS rollback/republish procedure based on last known good state.
- Communicate rollback status to team with incident summary.
