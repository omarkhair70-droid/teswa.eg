# QA Release Checklist (Production)

> Purpose: lightweight, repeatable manual QA before production OTA or store-facing releases.

## Scope
Use this checklist for:
- OTA updates to the `production` branch
- Navigation/UI changes
- Any change touching user flows

## Test setup
- Device: Android real device (preferred)
- App build: Production-targeted build/channel
- Account state: Returning user account with realistic data
- Network states: Normal, weak, and offline

---

## Manual QA scenarios

### 1) Returning user startup after inactivity
- Force-close app.
- Leave app inactive for a meaningful period.
- Re-open app.
- Verify app starts cleanly, no stuck splash/loading loop, and lands in expected signed-in state.

### 2) Google Native login/logout
- Log out fully.
- Log in with Google Native auth.
- Verify successful auth, expected landing screen, and stable session.
- Log out again and verify clean logged-out state.

### 3) Home hub actions
- Open Home hub.
- Execute primary actions (tap cards/buttons/quick actions).
- Verify each action routes to correct destination and can return safely.

### 4) Discover filters bottom sheet
- Open Discover.
- Open filters bottom sheet.
- Change multiple filters and apply.
- Re-open filters and verify expected selected state behavior.
- Clear/reset filters and confirm results update.

### 5) Notifications repeated tap safety
- Open Notifications list.
- Tap the same notification repeatedly/quickly.
- Verify no duplicate stacking, no crashes, and safe navigation behavior.

### 6) Messages filters and opening chats
- Open Messages.
- Switch available filters/tabs.
- Open multiple chats from each filtered state.
- Verify back navigation returns to expected messages context.

### 7) Item detail open/back/open
- Open an item detail.
- Navigate back.
- Open same or another item detail again.
- Verify no stale state, blank screen, or navigation break.

### 8) Public profile actions
- Open a public profile.
- Run key actions (view content, follow/contact/report if available).
- Verify action feedback and safe back navigation.

### 9) Deal room actions
- Open an existing deal room.
- Trigger common actions (message, status/action controls if available).
- Verify updates are reflected and screen remains stable.

### 10) Add item route
- Navigate into Add Item flow.
- Verify route opens correctly and key input surfaces render.
- Back out and re-enter once to confirm route stability.

### 11) Add story route
- Navigate into Add Story flow.
- Verify route opens correctly and key input surfaces render.
- Back out and re-enter once to confirm route stability.

### 12) Offline/weak network basic behavior
- With weak network: repeat a few key flows (Home, Discover, Messages).
- With offline mode: open app and attempt key actions.
- Verify graceful errors/retry behavior and no hard crashes.

### 13) OTA sanity check
- After OTA applied, cold start app.
- Verify startup + one pass through Home, Discover, Notifications, and Messages.
- Confirm version/update messaging appears normal (if surfaced).

---

## Sign-off
- [ ] Manual QA completed
- [ ] Blocking issues: none
- [ ] Non-blocking issues logged with owner
- [ ] Ready for production OTA/store follow-up
