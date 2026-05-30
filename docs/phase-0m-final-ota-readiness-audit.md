# Phase 0M — Final OTA readiness audit

## Goal

Close the current OTA-first roadmap with a final readiness audit before publishing one bundled production OTA update.

This phase is documentation-only and intentionally avoids code changes.

## Current OTA batch

The current batch after the production build includes:

- Runtime notification permission controls.
- Reliable Direct Chat voice/media control safeguards.
- Settings polish and app status information.
- Direct Chat reaction/reply polish.
- Home and Item perceived-speed states.
- User report form validation adoption.
- Visual system adoption through `AppInfoRow`.
- Notifications V1 center polish.

## OTA-safe status

The current batch is OTA-safe because it does not include:

- new packages
- native module additions
- Android permission changes
- Expo SDK changes
- app config/plugin changes
- Google/Firebase native config changes
- runtimeVersion/appVersion changes
- Supabase migrations

## Final checks before publishing OTA

Run from latest `main`:

```powershell
git checkout main
git pull origin main
npm run typecheck
git diff --check
npx expo-doctor
```

Manual smoke before OTA:

- Launch app.
- Confirm auth/session loads.
- Open Home.
- Open Item Detail.
- Open Profile.
- Open Settings.
- Open Settings > Notifications.
- Tap notification state refresh.
- Open Notification Center.
- Open an accepted Direct Chat.
- Long press a message and test reply/reaction.
- Open image/video/file attachments if available.
- Play a voice message if available.
- Open Report User and validate report reason/details behavior.

## Suggested OTA command

After all checks pass:

```powershell
eas update --channel production --message "OTA: settings, notifications, chat polish, and perceived-speed improvements"
```

## Post-OTA monitoring

After publishing OTA:

- Watch Sentry for new crashes.
- Watch Supabase `performance_metric` rows for:
  - `home_first_content_time`
  - `item_detail_first_content_time`
  - `direct_chat_first_message_time`
- Manually open the Play-installed production app and confirm it receives the update.
- Keep the next 24 hours focused on hotfix-only changes.

## Rollback posture

If a serious issue appears after OTA:

1. Identify the suspect PR.
2. Revert it on `main`.
3. Run checks again.
4. Publish a corrective OTA with a clear message.

Do not create a new native build unless the issue is native/config-related or cannot be corrected with JavaScript/TypeScript changes.
